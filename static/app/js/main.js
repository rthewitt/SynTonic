require.config({
    paths: {
        "jquery": ["http://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min", 
                    "libs/jquery/dist/jquery.min"],
        "bootstrap": "libs/bootstrap-dist/bootstrap.min",
        "underscore": "libs/underscore/underscore",
        "backbone": "libs/backbone/backbone",
        "mustache": "libs/mustache/mustache",
        "rxjs": "libs/rxjs/rx.all",
        "marionette": "libs/marionette/lib/backbone.marionette.min"
    },
    shim: {
        "backbone": {
            deps: ["jquery", "underscore"],
            exports: "Backbone"
        },
        "bootstrap": ["jquery"]
    }
});


// TODO User attempted to replay the three note melody instead of continuing with the remaining notes. Pause and replay melody on failure.
// TODO User played melody quickly instead of matching the timing of the notes. 
//      --   Add pendalty for timing miss, and indication of desired / played duration via key::press, key::release 
// FIXME two successive notes leaves no indication by activation. - TODO distinctLast (?) - won't hold up forever...
// TODO we need a graphical indicator of WHEN to press the key, for melody especially - easier than duration above - must simply match up with generated notes.
// FIXME melody game stop results in hanging activated notes

require([ 'jquery', 'underscore', 'rxjs', 'backbone', 'marionette', 'mustache', './game', './keyboard',
        './dispatcher', './audio', './util', './config',
        // consume
        'bootstrap'
        ], function($, _, Rx, Backbone, Marionette, Mustache, GameMaker, Keyboard, dispatcher, audio, util, config) {


            var game = null;
            var ws = null;

            // FIXME remove this, or document blacklist in UI
            var keyboard = window.KB = new Keyboard({ blacklist: [98] });

            var games = util.gameTypes,
                gameStates = util.gameStates;

            var midi = null;
            var midiInput; // need a handle for event listener

            var gameStop, 
                gameSelect, 
                scoreMeter;

            function colorKey(key, clazz, duration) {
                $('#'+key.id).addClass(clazz);
                if(!!duration) setTimeout(function() {
                    $('#'+key.id).removeClass(clazz);
                }, duration);
            }

            function parseMidi( event ) {
                // Uint8Array?
                var midiData = event.data;

                var first = midiData[0],
                    note = midiData[1],
                    velocity = midiData[2];

                if(first == 0x90) {
                    command = velocity == 0x0 ? 'off' : 'on';
                } else if(first == 0x80) command = 'off';
                else command = 'unknown command';

                return {
                    key: keyboard.keys[note-keyboard.min],
                    command: command
                }
            }


            // =========== GAME CONVERSION ============
            var timeout = 1000;
            var baseScore = 9;
            var reward = 1;
            var penalty = -6;
            var winThreshold = 30;

            // TODO simplify this
            function updateScoreBar(score, initial) {
                console.log('cur: '+score + '\nmax: '+winThreshold);
                var p = Math.round(100 * (score / winThreshold ));
                console.log(p);
                scoreMeter.css('width', ''+p+'%');
                if(initial) {
                    scoreMeter.removeClass('progress-bar-danger progress-bar-warning progress-bar-success');
                    scoreMeter.addClass('progress-bar-info');
                } else if(p < 10) {
                    scoreMeter.removeClass('progress-bar-info progress-bar-success progress-bar-warning');
                    scoreMeter.addClass('progress-bar-danger active');
                } else if(p < 20) {
                    scoreMeter.removeClass('progress-bar-info progress-bar-success progress-bar-danger active');
                    scoreMeter.addClass('progress-bar-warning');
                } else {
                    scoreMeter.removeClass('progress-bar-info progress-bar-danger progress-bar-warning active');
                    scoreMeter.addClass('progress-bar-success');
                }
            }

            function clearKey(key) {
                $('#'+key.id).removeClass('waiting success failure pressed'); // clearing pressed may be a mistake
            }

            function clearAllKeys() {
                _.each(keyboard.keys, clearKey);
            }

            function successKey(key) {
                colorKey(key, 'success', 200);
            };

            function failKey(key) {
                colorKey(key, 'failure', 200);
            };

            // Activate in this context means play the note(s) and color them (currently yellow)
            function activateKey(key) {
                // TODO leave this always on, then on timeout clear it and play buzzer
                colorKey(key, 'waiting', timeout); 
            }

            function onKeyPress(key) {
                if(!!game && game.state === gameStates.ANIMATING) {
                    ev.stopPropagation();
                    ev.preventDefault();
                } else dispatcher.trigger('key::press', key);
            }

            function onKeyUp(key) {
                dispatcher.trigger('key::release', key);
            };


            // win the game!
            function onFinish() {
                // UI cleanup
                clearAllKeys();
                gameStop.hide();

                // playful animation
                let kb = keyboard,
                keys = _.range(Math.floor((kb.max-kb.min)/2), kb.max-kb.min + 1)
                    .map((k) => kb.keys[k]);

                var kx = Rx.Observable.fromArray(keys),
                    ix = Rx.Observable.interval(40);

                Rx.Observable.zip(kx, ix, (item, i) => item).do((key) => {
                    keyboard.playNote(key);
                    colorKey(key, 'success', 80);
                }).subscribe();
            }

            function flowGenerate() {
                let first = keyboard.keysById['3C'],
                    last = keyboard.keysById['3B'],
                    min = keyboard.keys.indexOf(first),
                    max = keyboard.keys.indexOf(last),
                    n;
                do {
                    n = Math.floor( Math.random() * ((max+1)-min) ) + min; // those parens are necessary!
                } while(keyboard.blacklist.indexOf(n + min) !== -1); // blacklist currently in MIDI
                return keyboard.keys[n];
            }

            // started out as hit/miss, then changed to score calculation
            function evaluateSimple(attempt) {
                let success = attempt.target.id === attempt.pressed.id;
                let delta = success ?  reward : penalty;
                return Object.assign({}, attempt, 
                        { success: success, modifier: delta });
            }

            function updateUIForAttempt(attempt) {
                feedback = attempt.success ? successKey : failKey;
                feedback(attempt.pressed);
            }
            // =========== END GAME CONVERSION ============



            function createGame() {
                // TODO convert these as well...
                setupGameEvents();
                updateScoreBar(baseScore, true);

                // ReactiveX conversion
                var mouseKeyDowns = Rx.Observable.fromEvent($('.white, .black'), 'mousedown').map(ev => keyboard.keysById[ev.target.id]);
                var mouseKeyUps = Rx.Observable.fromEvent($('.white, .black'), 'mouseup').map(ev => keyboard.keysById[ev.target.id]);

                var playerPresses,
                    playerReleases;

                if(!!midiInput) {
                    var midiMessages = Rx.Observable.fromEvent(midiInput, 'midimessage').map(parseMidi);
                    var midiKeyDowns = midiMessages.filter((data) => data.command === 'on').pluck('key');
                    var midiKeyUps = midiMessages.filter((data) => data.command === 'off').pluck('key');

                    playerPresses = Rx.Observable.merge(mouseKeyDowns, midiKeyDowns);
                    playerReleases = Rx.Observable.merge(mouseKeyUps, midiKeyUps);
                } else {
                    playerPresses = mouseKeyDowns;
                    playerReleases = mouseKeyUps;
                }

                // hot observable - important because randomness means two altogether different streams
                var keygen = Rx.Observable.timer(0,timeout).map(flowGenerate).publish();

                playerPresses.subscribe(onKeyPress);
                playerReleases.subscribe(onKeyUp);

                // was looking at example with merging stop events and takeUntil on the final listener
                var ender = Rx.Observable.fromEvent(gameStop, 'click').do(onFinish);

                // no onFinish here, but should evaluate? TODO
                var activator = keygen.takeUntil(ender).subscribe(activateKey);


                function onTimeout() {
                    // TODO use scan to watch score events, with a reward or penalty, an onError if less than 0, and complete on win
                    //dispatcher.trigger('game::score', { current: this.score, max: this.threshold });
                    console.log('buzzer');
                    //audio.playSound('buzzer');
                }

                // FIXME this only calls onFinish when both playerPresses and attempts are exhausted, NOT WHAT WE WANT, and separate from above
                // TODO add buffer in here?  To force all keypresses to be one for a given note... (if length == 0, penalty, but not timeout error)
                // functions represent time windows on the join
                var attempts = keygen.join(playerPresses, 
                        () => Rx.Observable.timer(1000), 
                        () => Rx.Observable.timer(0), 
                        (x,y) => ({ target: x, pressed: y }) 
                    )


                var scoreBoard = attempts.map(evaluateSimple).do(updateUIForAttempt).pluck('modifier').scan((score, delta) => score+delta, baseScore).subscribe(updateScoreBar) //.do(updateUIForAttempt).subscribe();

                var gamePlay = keygen.subscribe(()=>{}, onTimeout, onFinish); // should allow error for timeout when present, complete for no more notes?

                // Start the game
                keygen.connect();
                gameStop.show(); 
            }

            function startPianoApp() {

                gameStop = $('#stop-game');
                gameSelect = $('#game-type');
                scoreMeter = $('#score-meter');


                function listMidiIO() {
                    // TODO add these to dropdown of some sort
                    for (var entry of midi.inputs) {
                        var input = entry[1];
                        console.log('found midi input ' + input.name + ' ::: ' + input.id);
                        if(input.id === 'D236B183A211441B323363DFA0572EDB190FA7BC961CAB61DE989CBCDC6C5D67') {
                            console.log('TODO create a dropdown select for input/output');
                            midiInput = input;
                            //input.onmidimessage = onMIDIMessage;

                            $('#is-connected').prop('checked', 'checked');
                        }
                    }
                    for (var entry of midi.outputs) {
                        var output = entry[1];
                        console.log('OUTPUT ' + output.name + ' ::: ' + output.id);
                        if(output.id === '37404369B80CF4EF4EC25AF434890FD1792FFD304E48EEE6E57D6D5430B5378A') {
                            output.open();
                            keyboard.output = true;
                            keyboard.midiOut = output;
                            $('#use-instrument').prop('checked', 'checked');
                        }
                    }
                }

                function onMidiSuccess(mAccess) {
                    console.log('MIDI ready');
                    midi = window.MIDI = mAccess;
                    listMidiIO();
                    createGame();
                }

                function onMidiFailure(msg) {
                    console.log('Failed to get MIDI access - ' + msg);
                }

                // for system exclusive messages, pass opts: { sysex: true }
                navigator.requestMIDIAccess().then(onMidiSuccess, onMidiFailure);

                gameSelect.on('change', onGameSelect);
                $('#use-instrument').change(function() {
                    keyboard.output = $(this).prop('checked');
                });

                ws = new WebSocket('ws://localhost:8888');

                // ensure game is created on page load
                gameSelect.trigger('change');
            }


            function onGameSelect(ev) { 
                if(!!game) {
                    game.cleanup(); // avoid memory leaks
                    delete game;
                }

                var gType = parseInt(this.value);
                var gameOpts = {
                    keyboard: keyboard
                };

                switch(gType) {
                    case games.FLOW:
                        game = GameMaker.createFlowGame(gameOpts);
                        break;
                    case games.MELODY:
                        game = GameMaker.createMemoryGame(gameOpts);
                        break;
                    case games.APT:
                        game = GameMaker.createAptitudeGame(gameOpts);
                        break;
                }
            }


            /* TODO remove
            function onGameStopPress(ev) { 
                if(!!game) {
                    game.reset();
                    gameStop.hide();
                }
            }
            */

            function setupGameEvents() {


                dispatcher.on('game::lost', function(ev) {
                    gameStop.hide();

                    allKeys = $('.white, .black');
                    allKeys.removeClass('waiting');
                    allKeys.addClass('failure pressed');

                    keyboard.playNotes(keyboard.keys, 1500.0);

                    setTimeout(function() {
                        game.reset();
                    }, 1500);

                });

                // notice plural for now
                dispatcher.on('keys::clear', function(ev) {
                    if(!!ev && !!ev.keys)
                        _.each(ev.keys, clearKey)
                    else clearAllKeys();
                });

                dispatcher.on('key::success', successKey);
                dispatcher.on('key::miss', failKey);
            }




            var app = new Marionette.Application();
            app.addRegions({
                benches: '#notes'
            });
            
            $(document).ready(startPianoApp);
});
