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


// FIXME pressing a button rapidly can give two points
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
                showSettings,
                scoreBoard, 
                progressBar;

            var treble = {
                canvas: undefined,
                ctx: undefined,
            };

            var bass = {
                canvas: undefined,
                ctx: undefined,
            };

            const TREBLE_BAR_HEIGHT = 25;
            const noteNames = ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
            const NOTES_POS_H = [175, 175, 163, 163, 150, 138, 138, 125, 125, 113, 113, 100];
            const STREAM_SPEED = -5;

            var sharp = new Image();
            sharp.src = 'img/sharp.gif';

            function drawNote(note) {
                let ctx = treble.ctx;

                // lines for special notes
                if(note.id === keyboard.MIDDLE_C || note.id === keyboard.MIDDLE_C+'s' ) {
                    ctx.beginPath();
                    ctx.moveTo(note.x-15, note.y);
                    ctx.lineTo(note.x+15, note.y);
                    ctx.stroke();
                } else if(note.id === '3D' || note.id === '3Ds') {
                    ctx.beginPath();
                    ctx.moveTo(note.x-15, note.y+12);
                    ctx.lineTo(note.x+15, note.y+12);
                    ctx.stroke();
                }

                // draw note
                ctx.beginPath();
                if(note.name.endsWith('s')) {
                    ctx.fillStyle = 'red';
                }
                ctx.arc(note.x, note.y, 10, 0, 2*Math.PI);
                ctx.fill();
                ctx.fillStyle = 'black';
            }
    
            function renderCleff() {
                renderStaff([]) // just for background
                let ctx = treble.ctx;
                var tc = new Image();
                tc.onload = () => ctx.drawImage(tc, 0, 8, 75, 190);
                tc.src = 'img/treble-cleff.gif';
            }

            function renderStaff(notes) {
                let ctx = treble.ctx;
                ctx.clearRect(70, 40, 600, 150);
                for(var x=2; x<=6; x++) {
                    let pos = x*TREBLE_BAR_HEIGHT;
                    ctx.beginPath();
                    ctx.moveTo(0,pos);
                    ctx.lineTo(600,pos);
                    ctx.stroke();
                }
                notes.map(drawNote);
            }

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


            // TODO handle game-over conditions. Lose on incorrect is true to inspiration.  Additional lose on complete miss for independent timing
            
            var timeout = 1E3;
            var reward = 1;
            var penalty = 0;
            var gameTime = 20;


            function updateProgressBar(cur, max) {
                var p = Math.round(100 * (cur / max));
                progressBar.css('width', ''+p+'%');
                if(p < 10) {
                    progressBar.removeClass('progress-bar-info progress-bar-success progress-bar-warning');
                    progressBar.addClass('progress-bar-danger active');
                } else if(p < 20) {
                    progressBar.removeClass('progress-bar-info progress-bar-success progress-bar-danger active');
                    progressBar.addClass('progress-bar-warning');
                } else {
                    progressBar.removeClass('progress-bar-info progress-bar-danger progress-bar-warning active');
                    progressBar.addClass('progress-bar-success');
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

            function activateKey(key) {
                colorKey(key, 'waiting'); 
            }





            var maxNoteX = 150;

            function Note(id) {
                this.id = id; 
                this.key = keyboard.keysById[id];
                this.name = this.key.note;
                this.x = maxNoteX;
                this.y = NOTES_POS_H[noteNames.indexOf(this.name)]
            }

            // started out as hit/miss, then changed to score calculation
            function evaluateSimple(attempt) {
                let success = attempt.target.id === attempt.pressed.id;
                let delta = success ?  reward : penalty;
                return Object.assign({}, attempt, 
                        { success: success, modifier: delta });
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
                return new Note(keyboard.keys[n].id);
            }

            function updateUIForAttempt(attempt) {
                feedback = attempt.success ? successKey : failKey;
                feedback(attempt.pressed);
            }

            // =========== END GAME CONVERSION ============



            /*
             * Important: 
             * At-your-own Pace:
             * we want the pressing of notes to drive the animation
             * Independent Timing:
             * we want the animation to drive the activation of notes
             *
             * We can seed the first note to avoid chicke-and-egg streams
             */
            function createGame() {
                // TODO convert these as well...
                setupGameEvents();

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


                // "generator" for notes
                var notegen = new Rx.Subject();

                // state variable
                var playQueue = [];

                // IMPORTANT playQueue dequeues must only occur downstream to preserve accuracy
                var attempts = playerPresses.map((x) => ({ target: playQueue[0], pressed: x })).map(evaluateSimple);

                // various ways the game will end - apply with array did not work...
                var ender = Rx.Observable.merge(
                    Rx.Observable.fromEvent(gameStop, 'click').do(() => console.log('GAME MANUALLY STOPPED')),
                    Rx.Observable.interval(1E3 * gameTime).take(1).do(() => console.log('GAME TIMED OUT...')),
                    attempts.filter((a) => !a.success).delay(100)
                    ).publish().refCount(); // make it hot


                // update scoreBoard
                attempts.pluck('modifier').takeUntil(ender).scan((score, delta) => score+delta > 0 ? score+delta : 0 , 0).subscribe((score) => scoreBoard.text(''+score)) 

                // update progress
                Rx.Observable.timer(0, 500).takeUntil(ender).subscribe((elapsed) => {
                    let max = 2 * gameTime,
                        left = max - (elapsed+1); // +1 to end animation at zero
                    updateProgressBar(left > 0 ? left : left, max);
                });


                var noteStream = Rx.Observable.interval(16).takeUntil(ender).scan((v, tick) => { 
                    let tempo = playQueue[0].x <= 100 ? 0 : v || STREAM_SPEED;
                    playQueue.map((note) => {
                        note.x = note.x + tempo;
                    });
                    return tempo;
                }, STREAM_SPEED).subscribe(() => renderStaff(playQueue));


                // TODO move this into settings somewhere
                // do we want to play "out of octave sound"?
                let audibleMiss = true;
                playerReleases.subscribe((key) => dispatcher.trigger('key::release', key));
                if(audibleMiss) {
                    attempts.subscribe((attempt) => {
                        key = attempt.success ? attempt.pressed : keyboard.keysById['0C'];
                        dispatcher.trigger('key::press', key);
                        dispatcher.trigger('key::release', key);
                    });
                } else playerPresses.subscribe((key) => dispatcher.trigger('key::press', key));


                // player needs a new key to play!
                // instead of advancing the sheet music, we think of the sheet music as an ever advancing stream that stops only when it must
                var moveForward = attempts.takeUntil(ender).do(updateUIForAttempt).filter((attempt) => attempt.success).delay(100).do(clearAllKeys).delay(150).subscribe((attempt) => {
                    playQueue.shift();
                    if(playQueue.length < 12) 
                        notegen.onNext(flowGenerate())
                    // advance the keyboard UI
                    activateKey(playQueue[0].key); 
                },
                (err) => console.log(err),
                // on complete (game ended)
                () => {
                    console.log('ENDING GAME');
                    clearAllKeys();
                    renderStaff([]);
                    updateProgressBar(0,1);
                });

                // do onFinish here and trigger either ender or onComplete of notegen Subject
                var gamePlay = notegen.takeUntil(ender).subscribe((note) => { 
                    // if there are notes already, we want to offset them
                    if(playQueue.length > 0) 
                        note.x = playQueue[playQueue.length-1].x + 80; // place at end of staff
                    playQueue.push(note); // always push!
                });

                let startNote = new Note(keyboard.MIDDLE_C);
                notegen.onNext(startNote);
                activateKey(startNote.key); 
                for(var z=0; z<11; z++) {
                    notegen.onNext(flowGenerate());
                }
                gameStop.show(); 
                renderCleff();
                scoreBoard.text('0');
            }


            function startPianoApp() {

                gameStop = $('#stop-game');
                gameSelect = $('#game-type');
                showSettings = $('#show-settings');
                progressBar = $('#progress-meter');
                scoreBoard = $('#scoreboard');

                showSettings.on('click', (ev) => $('#settings').modal('show'));

                treble.canvas = $('#treble-staff')[0];
                treble.ctx = treble.canvas.getContext('2d');


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


            function setupGameEvents() {

                // TODO show a popup instead
                // TODO determine lose conditions - on miss?
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
