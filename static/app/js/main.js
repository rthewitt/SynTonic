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


// TODO we need a graphical indicator of WHEN to press the key, for melody especially
// FIXME no keyup is displayed - what was previous logic?
// FIXME on game success, we need to create another one if it is destroyed
// TODO rename ui::clear to indicate that it only clears keyboard keys, NOT score meter or other game related information
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

            var stopGame, 
                gameSelect, 
                scoreMeter;

            function clearKey(key) {
                $('#'+key.id).removeClass('waiting success failure pressed'); // clearing pressed may be a mistake
            }

            function colorKey(key, clazz) {
                $('#'+key.id).addClass(clazz);
            }

            // Activate in this context means play the note(s) and color them (currently yellow)
            function activateKey(key) {
                colorKey(key, 'waiting'); 
                setTimeout(function() { clearKey(key); }, 500) // TEMPORARY
            }

            // Activate in this context means play the note(s) and color them (currently yellow)
            // TODO remove this completely after modifying games
            function activateFromData(data) {
                console.log('should activate '+data.keys.length+' keys');
                data.keys.forEach(function(k){ console.log(k);});
                setTimeout(function() { 
                    colorKeys(data.keys, 'waiting'); 
                    if(data.sound) keyboard.playNotes(data.keys);
                }, (data.when || 0));
            }


            function startPianoApp() {
                // ReactiveX conversion
                var timeSource = Rx.Observable.timer(0,500);
                var keyGen = Rx.Observable.from(keyboard.keys); // TODO make random, potentially infinite?
                var activator = Rx.Observable.zip(timeSource, keyGen, (i,x) => x).subscribe(activateKey);

                stopGame = $('#stop-game');
                gameSelect = $('#game-type');
                scoreMeter = $('#score-meter');

                setupGameEvents();

                function listMidiIO() {
                    // TODO add these to dropdown of some sort
                    for (var entry of midi.inputs) {
                        var input = entry[1];
                        console.log('found midi input ' + input.name + ' ::: ' + input.id);
                        if(input.id === 'D236B183A211441B323363DFA0572EDB190FA7BC961CAB61DE989CBCDC6C5D67') {
                            console.log('TODO create a dropdown select for input/output');
                            input.onmidimessage = onMIDIMessage;

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
                }

                function onMidiFailure(msg) {
                    console.log('Failed to get MIDI access - ' + msg);
                }

                // for system exclusive messages, pass opts: { sysex: true }
                navigator.requestMIDIAccess().then(onMidiSuccess, onMidiFailure);


                $(".white, .black").mousedown(function (ev) {

                    var toneId = $(this).attr('id'),
                        key = keyboard.keysById[toneId];

                    // ignore any input while game is animating
                    if(!!game && game.state === gameStates.ANIMATING) {
                        ev.stopPropagation();
                        ev.preventDefault();
                    } else dispatcher.trigger('key::press', key);
                 });


                $(".white, .black").mouseup(function () {
                    $(this).removeClass('pressed')
                    var toneId = $(this).attr('id'),
                        key = keyboard.keysById[toneId];
                    //dispatcher.trigger('key::release', key);
                 });


                gameSelect.on('change', onGameSelect);
                stopGame.on('click', onGameStopPress);
                $('#use-instrument').change(function() {
                    keyboard.output = $(this).prop('checked');
                });

                ws = new WebSocket('ws://localhost:8888');

                // ensure game is created on page load
                gameSelect.trigger('change');
            }


            // TODO FIXME stop all notes playing (has race condition, or lack of delay)
            // maybe try using a callback after failure
            // This will be a view later
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


            function onGameStopPress(ev) { 
                if(!!game) {
                    game.reset();
                    stopGame.hide();
                }
            }


            // play the note queue [q] and render with CSS class
            // clazz can be a multi selector as well
            function playNotesRecursive(q, clazz, cb) {
                console.log(gameStates.names[game.state]);

                q = q || _.range(keyboard.max - keyboard.min + 1);

                cur = q.shift();
                if(typeof cur !== 'undefined') {
                    var key = keyboard.keys[cur];
                    if(!!clazz) {
                        // render key state
                        colorKeys([ key ], clazz);
                        setTimeout(function() {
                            clearKeys( { keys: [ key ] } );
                        }, 80);
                    }
                    keyboard.playNote(key);
                    setTimeout(function() {
                        playNotesRecursive(q, clazz, cb);
                    },40);
                } else cb();
            }


            // TODO delete me
            function clearKeys(data) {
                var keys;
                if(!!data && !!data.keys && data.keys.length > 0) {
                    keys = _.map(data.keys, function(k) {
                        return $('#'+k.id);
                    });
                } else keys = [ $('.white, .black') ];

                // this array structure will allow for chords, groups to be cleared
                _.each(keys, function($el) { $el.removeClass('waiting success failure pressed'); });
            }


            // currently indexes
            function colorKeys(keys, clazz) {
                _.each(keys, function(key) {
                    $('#'+key.id).addClass(clazz);
                });
            }


            function setupGameEvents() {

                dispatcher.on('game::score', function(score) {
                    //console.log('cur: '+score.current + '\nmax: '+score.max);
                    var p = Math.round(100 * (score.current / score.max));
                    console.log(p);
                    scoreMeter.css('width', ''+p+'%');
                    if(score.initial) {
                        scoreMeter.removeClass('progress-bar-danger progress-bar-warning progress-bar-success');
                        scoreMeter.addClass('progress-bar-info');
                    }
                    else if(p < 10) {
                        scoreMeter.removeClass('progress-bar-info progress-bar-success progress-bar-warning');
                        scoreMeter.addClass('progress-bar-danger active');
                    } else if(p < 20) {
                        scoreMeter.removeClass('progress-bar-info progress-bar-success progress-bar-danger active');
                        scoreMeter.addClass('progress-bar-warning');
                    } else {
                        scoreMeter.removeClass('progress-bar-info progress-bar-danger progress-bar-warning active');
                        scoreMeter.addClass('progress-bar-success');
                    }
                });

                dispatcher.on('game::start', function(ev) {
                    stopGame.show();
                });

                // TODO either get a smaller more pleasant sound, or use the following technique to cut it short
                // http://stackoverflow.com/questions/5932412/html5-audio-how-to-play-only-a-selected-portion-of-an-audio-file-audio-sprite
                dispatcher.on('game::timeout', function(ev) {
                    dispatcher.trigger('ui::clear');
                    soundBuzzer();
                    setTimeout(ev.onReady, 2000);
                });


                dispatcher.on('game::lost', function(ev) {
                    stopGame.hide();

                    allKeys = $('.white, .black');
                    allKeys.removeClass('waiting');
                    allKeys.addClass('failure pressed');

                    keyboard.playNotes(keyboard.keys, 5000.0);

                    setTimeout(function() {
                        game.reset();
                    }, 5000);

                });

                dispatcher.on('ui::clear', clearKeys);

                dispatcher.on('key::success', function(data) {
                    colorKeys([ data.key ], 'success');
                    setTimeout(function() {
                        $('#'+data.key.id).removeClass('success');
                    }, 200);
                });


                dispatcher.on('key::miss', function(data) {
                    colorKeys([ data.key ], 'failure');
                    setTimeout(function() {
                        if(!!game && game.state !== gameStates.ANIMATING) {
                            // fixes race condition - better method?
                            $('#'+data.key.id).removeClass('failure');
                        } 
                    }, 200);
                });


                dispatcher.on('game::activate', activateFromData);


                dispatcher.on('game::won', function(ev) {
                    stopGame.hide();

                    var kb = keyboard,
                    keyRange = _.range(Math.floor((kb.max-kb.min)/2), kb.max-kb.min + 1);

                    var cb = function() {
                        ev.onFinish();
                    };
                    playNotesRecursive(keyRange, 'pressed success', cb);
                });
            }


            // TODO: consider if a timeout sound makes sense for keyboard
            // when I support different sorts, may only have one octave
            // so we need to ensure that a default stragey like web audio is present
            function soundBuzzer() {
                console.log('buzzer');
                audio.playSound('buzzer');
            }

            
            // Why does this stuff exist again?

            function onMIDIMessage( event ) {
                // Uint8Array?
                var midiData = event.data;

                var first = midiData[0],
                    note = midiData[1],
                    velocity = midiData[2];

                if(first == 0x90) {
                    command = velocity == 0x0 ? 'off' : 'on';
                } else if(first == 0x80) command = 'off';
                else command = 'unknown command';

                /*
                console.log(command);
                console.log(note);
                console.log(velocity);
                */

                key = keyboard.keys[note-keyboard.min];

                if(!!game && game.state !== gameStates.ANIMATING) {
                    if(command === 'on') dispatcher.trigger('key::press', key);
                    else if(command === 'off') dispatcher.trigger('key::release', key);
                }
            }


            var app = new Marionette.Application();
            app.addRegions({
                benches: '#notes'
            });
            
            $(document).ready(startPianoApp);
});
