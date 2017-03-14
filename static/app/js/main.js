require.config({
    paths: {
        "jquery": ["http://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min", 
                    "libs/jquery/dist/jquery.min"],
        "bootstrap": "libs/bootstrap-dist/bootstrap.min",
        "underscore": "libs/underscore/underscore",
        "backbone": "libs/backbone/backbone",
        "vexflow": "libs/vexflow/vexflow-min",
        "mustache": "libs/mustache/mustache",
        "mousetrap": "libs/mousetrap/mousetrap.min",
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


require([ 'jquery', 'underscore', 'rxjs', 'backbone', 'marionette', 'mustache', 'vexflow', 'mousetrap', './game', './sheet', 'keyboard',
        './dispatcher', './audio', './util', './config',
        // consume
        'bootstrap'
        ], function($, _, Rx, Backbone, Marionette, Mustache, Vex, MouseTrap, Games, MusicSheet, Keyboard, dispatcher, audio, util, config) {


            // FIXME REMOVE
            window.doRelay = function() { dispatcher.trigger('game::relay'); }

            var game = null;
            var ws = null;

            // FIXME remove this, or document blacklist in UI
            var keyboard = window.KB = new Keyboard({ blacklist: [98] });

            var gameOver,
                gameStop,
                gameStart,
                gameSelect,
                gameOverMessage,
                // settings
                showSettings,
                keySig;

            var midi = null,
                midiInput, // need a handle for event listener
                playerPresses,
                playerReleases,
                easyDismi$$; // temporary handler to continue with keypress

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


            function setupInputHandlers() {
                
                let qkeys = {
                    'a': 'A',
                    'b': 'B',
                    'c': 'C',
                    'd': 'D',
                    'e': 'E',
                    'f': 'F',
                    'g': 'G',
                    'shift+a': 'As',
                    'shift+b': 'Bs',
                    'shift+c': 'Cs',
                    'shift+d': 'Ds',
                    'shift+e': 'Es',
                    'shift+f': 'Fs',
                    'shift+g': 'Gs',
                    'ctrl+a': 'Ab',
                    'ctrl+b': 'Bb',
                    'ctrl+c': 'Cb',
                    'ctrl+d': 'Db',
                    'ctrl+e': 'Eb',
                    'ctrl+f': 'Fb',
                    'ctrl+g': 'Gb'
                };
                for(let combo in qkeys) MouseTrap.bind(combo, 
                        () => dispatcher.trigger('qwerty', qkeys[combo]));

                //  we may have problems here
                let qwertyPresses = Rx.Observable.fromEvent(dispatcher, 'qwerty').map(noteName => ({ id: null, note: noteName, qwerty: true }));

                // TODO move this into keyboard
                let mouseKeyDowns = Rx.Observable.fromEvent($('.white, .black'), 'mousedown').map(ev => keyboard.keysById[ev.target.id]);
                let mouseKeyUps = Rx.Observable.fromEvent($('.white, .black'), 'mouseup').map(ev => keyboard.keysById[ev.target.id]);

                if(!!midiInput) {
                    let midiMessages = Rx.Observable.fromEvent(midiInput, 'midimessage').map(parseMidi);
                    let midiKeyDowns = midiMessages.filter((data) => data.command === 'on').pluck('key');
                    let midiKeyUps = midiMessages.filter((data) => data.command === 'off').pluck('key');

                    playerPresses = Rx.Observable.merge(mouseKeyDowns, midiKeyDowns, qwertyPresses);
                    playerReleases = Rx.Observable.merge(mouseKeyUps, midiKeyUps);
                } else {
                    playerPresses = Rx.Observable.merge(mouseKeyDowns, qwertyPresses);
                    playerReleases = mouseKeyUps;
                }
            }


            function removeInputHandlers(mAccess) {
            }

            const hardcodedInputs = ['D236B183A211441B323363DFA0572EDB190FA7BC961CAB61DE989CBCDC6C5D67', 'EF99508ECC892C3460736F15B536E304B0BBE88E7BFA62BE3CA2D8B56CC3996A', '-11152290'];
            const hardcodedOutputs = ['37404369B80CF4EF4EC25AF434890FD1792FFD304E48EEE6E57D6D5430B5378A', 'F14ED547EB80062598FBC248E6D86BA69CE0A808B1E86C5209421CAC47410812', '1380637477'];

            function onMidiSuccess(mAccess) {
                midi = window.MIDI = mAccess;
                for (var entry of midi.inputs) {
                    var input = entry[1];
                    console.log('found midi input ' + input.name + ' ::: ' + input.id);
                    if(hardcodedInputs.indexOf(input.id) !== -1) {
                        console.log('TODO create a dropdown select for input/output');
                        midiInput = input;
                        $('#is-connected').prop('checked', 'checked');
                    }
                }
                for (var entry of midi.outputs) {
                    var output = entry[1];
                    console.log('OUTPUT ' + output.name + ' ::: ' + output.id);
                    if(hardcodedOutputs.indexOf(output.id) !== -1) {
                        output.open();
                        keyboard.output = true;
                        keyboard.midiOut = output;
                        $('#use-instrument').prop('checked', 'checked');
                    }
                }
                setupInputHandlers();
                gameStart.trigger('click');
            }


            function onMidiFailure(msg) {
                console.log('Failed to get MIDI access - ' + msg);
            }

            function clearUI() {
                keyboard.clearAllKeys();
                MusicSheet.renderStavesEmpty(currentKeySignature()); 
            }
            
            function startPianoApp() {
                // so that we can pass instrument into the Game constructor once again
                MusicSheet.init(keyboard); // set up the Dom

                showSettings = $('#show-settings');
                gameSelect = $('#game-type');
                gameStart = $('#start-game');
                gameStop = $('#stop-game');
                gameOver = $('#gameover');
                gameOverMsg = $('#game-over-message');

                $('#play-again').on('click', onPlayAgain);
                var $gameOver = document.querySelector('#gameover');
                MouseTrap($gameOver).bind('enter', (e, combo) => {
                        gameOver.modal('hide');
                        onPlayAgain();
                });
                MouseTrap.bind('esc', () => gameStop.trigger('click'));

                gameOver.on('hidden.bs.modal', () => {
                    // get rid of MIDI listener so it doesn't impact gameplay
                    if(!!easyDismi$$) {
                        easyDismi$$.dispose();
                        easyDismi$$ = null;
                    }
                });

                $('#settings').on('shown.bs.modal', clearUI);

                // came from settings dialog
                $('#play-now').on('click', () => onGameStart($('#mode-display').text().toUpperCase()) );

                gameStop.on('click', onGameStop);
                gameStart.on('click', () => onGameStart($('#mode-display').text().toUpperCase()));

                $('#game-type-ul li').on('click', (ev) => $('#mode-display').text($(ev.currentTarget).text()));
                showSettings.on('click', (ev) => $('#settings').modal('show'));

                keySig = $('#keysig');
                // TODO use select keysig from UI, and place click handler there to update select & graphics in place
                // so that user does not have to choose based on previous knowledge
                keySig.on('change', ev => {
                    keyboard.clearAllKeys();
                    MusicSheet.renderStavesEmpty(currentKeySignature()); 
                });


                // requires a game to exist of course
                dispatcher.on('game::over', (success) => {
                    setTimeout( () => displayEndScore(success), 600);
                    onGameStop();
                });

                // for system exclusive messages, pass opts: { sysex: true }
                navigator.requestMIDIAccess().then(onMidiSuccess, onMidiFailure);

                $('#use-instrument').change(function() {
                    keyboard.output = $(this).prop('checked');
                });

                ws = new WebSocket('ws://localhost:8888');
            }


            function onPlayAgain(ev) {
                gameOverMsg.text('');
                onGameStart(util.gameTypes.names[game.type]);
            }


            function displayEndScore(success) {
                // remove game so that we can take over keypress handlers
                if(!!game) {
                    game.cleanup(); 
                    delete game;
                }
                let best = parseInt(localStorage['best']) || 0;
                let currentScore = parseInt(game.score) || 0;
                msg = 'Score: ' + currentScore;
                if( currentScore > best ) {
                    localStorage['best'] = currentScore;
                    msg += ' - BEST YET! :-D'
                }
                gameOverMsg.text(msg);
                // allow middle c to close the dialog so user doesn't need to use laptop
                easyDismi$$ = playerPresses.filter((key) => key === keyboard.MIDDLE_C).take(1).subscribe(()=> {
                    gameOver.modal('hide');
                    onPlayAgain();
                });
                gameOver.modal('show');
                $('#play-again').focus();
            }


            function onGameStop() {
                gameSelect.closest('.btn-group').show();
                gameStop.hide();
                gameStart.show();
                showSettings.attr('disabled', false);
            }

            function currentKeySignature() {
                let chosenKey = keySig.val();
                return chosenKey === 'none' ?  null : chosenKey;
            }


            function onGameStart(selected) { 
                // this should never happen
                if(!!game) {
                    game.cleanup(); // avoid memory leaks
                    delete game;
                }

                gameStart.hide(); 
                gameStop.show(); 
                showSettings.attr('disabled', true);

                let gt = util.gameTypes;
                let mode = gt.names.indexOf(selected);
                switch(mode) {
                    case gt.FLOW:
                    case gt.STAMINA:
                    case gt.SCALES:
                        // TODO move instrument midiInput into Keyboard!
                        game = new Games.Game({ 
                            type: mode,
                            keyboard: keyboard,
                            key: currentKeySignature(),
                            keyHints: true, // TODO drop keyhints after first or second relay
                            playerPresses: playerPresses,
                            playerReleases: playerReleases
                        });
                        break;
                    case gt.MELODY: // TODO
                    case gt.APT:
                        break;
                }
                gameSelect.closest('.btn-group').hide();
            }

            var app = new Marionette.Application();
            app.addRegions({
                benches: '#notes'
            });
            
            $(document).ready(startPianoApp);
});
