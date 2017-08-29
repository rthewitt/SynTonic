require.config({
    paths: {
        "jquery": ["http://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min", 
                    "libs/jquery/dist/jquery.min"],
        "bootstrap": "libs/bootstrap-dist/bootstrap.min",
        "bootstrap-slider": "libs/bootstrap-slider/bootstrap-slider.min",
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


require([ 'jquery', 'underscore', 'rxjs', 'backbone', 'marionette', 'mustache', 'vexflow', 'mousetrap', './game', './sheet', 'keyboard', 'microphone',
        './dispatcher', './audio', './util', './config',
        // consume
        'bootstrap', 'bootstrap-slider'
        ], function($, _, Rx, Backbone, Marionette, Mustache, Vex, MouseTrap, Games, MusicSheet, Keyboard, Microphone, dispatcher, audio, util, config) {

            var game = null;
            var ws = null;

            // FIXME remove this, or document blacklist in UI
            var keyboard = window.KB = new Keyboard({ blacklist: [98] });
            var mic = window.MIC = new Microphone();

            var gameOver,
                gameStop,
                gameStart,
                gameSelect,
                gameSpeed,
                gameOverMessage,
                // settings
                showSettings,
                keySig;

            var midi = null,
                midiInput = { addEventListener: function(){} }, // need a handle for event listener
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

                MouseTrap.bind(['plus', '='], () => { gameSpeed.setValue(gameSpeed.getValue()+2); });
                MouseTrap.bind(['-', '_'], () => { gameSpeed.setValue(gameSpeed.getValue()-2); });
                
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

                let qwertyPresses = Rx.Observable.fromEvent(dispatcher, 'qwerty')
                    .map(noteName => ({ fromNote: noteName, key: keyboard.notesById['4'+noteName].pianoKey }));

                let mouseKeyDowns = Rx.Observable.fromEvent($('.white, .black'), 'mousedown').do(ev=>console.log('pressed '+ev.target.id)).map(ev => ({ key: keyboard.keysById[ev.target.id] }) );
                let mouseKeyUps = Rx.Observable.fromEvent($('.white, .black'), 'mouseup').do(ev=>console.log('released '+ev.target.id)).map(ev => ({ key: keyboard.keysById[ev.target.id] }) );

                let midiMessages = Rx.Observable.fromEvent(midiInput, 'midimessage').map(parseMidi);
                let midiKeyDowns = midiMessages.filter( m => m.command === 'on');
                let midiKeyUps = midiMessages.filter( m => m.command === 'off');

                // TODO pressKey/releaseKey only exists here - move this into keyboard so that it functions as an adapter. 
                // Then disable keyboard from this file when we need to hijack user input.  Or... force dispose and reconnect through "detach", "connect" methods
                Rx.Observable.merge(
                        Rx.Observable.merge(mouseKeyDowns, midiKeyDowns, qwertyPresses)
                            .map(press => ({ key: press.key, action: 1, fromNote: press.fromNote || false })),

                        Rx.Observable.merge(mouseKeyUps, midiKeyUps, qwertyPresses.delay(300))
                            .map(rel => ({ key: rel.key, action: 0, fromNote: rel.fromNote || false }))
                    ).subscribe( input => {
                        if(input.action > 0) keyboard.pressKey(input.key, input);
                        else keyboard.releaseKey(input.key, input);
                    });
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
                $('#scoreboard').text('0');
                keyboard.clearAllKeys();
                MusicSheet.renderStavesEmpty(currentKeySignature()); 
            }

            function startPianoApp() {
                // so that we can pass instrument into the Game constructor once again
                MusicSheet.init(keyboard); // set up the Dom

                showSettings = $('#show-settings');
                gameSelect = $('#game-type');
                gameStart = $('#start-game');
                gameStop = $('.stop-game');
                stopText = $('.stop-text');
                playNow = $('#play-now');
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

                // came from settings dialog
                playNow.on('click', () => onGameStart($('#mode-display').text().toUpperCase()));

                gameStop.on('click', onGameStop);
                gameStart.on('click', () => onGameStart($('#mode-display').text().toUpperCase()));

                $('#game-type-ul li').on('click', (ev) => $('#mode-display').text($(ev.currentTarget).text()));
                showSettings.on('click', (ev) => $('#settings').modal('show'));

                keySig = $('#keysig');
                // TODO add a way to change key signatures from outside of settings dialog
                keySig.on('change', ev => {
                    keyboard.clearAllKeys();
                    MusicSheet.renderStavesEmpty(currentKeySignature()); 
                });

                gameSpeed = $('#game-speed').slider()
                    .on('slide', () => { 
                        if(!!game) game.setSpeed(gameSpeed.getValue()); 
                    }).data('slider');


                // requires a game to exist of course
                dispatcher.on('game::over', (success) => {
                    setTimeout( () => {
                        if(!!game) delete game;
                        displayEndScore(success)
                        afterGameStop();
                    }, 400);
                });

                // for system exclusive messages, pass opts: { sysex: true }
                navigator.requestMIDIAccess().then(onMidiSuccess, onMidiFailure);

                $('#use-instrument').change(function() {
                    keyboard.output = $(this).prop('checked');
                });

                ws = new WebSocket('ws://localhost:8888');
            }
            
            function startWhistleApp() {

                $('#piano').hide();

                // so that we can pass instrument into the Game constructor once again
                MusicSheet.init(keyboard); // set up the Dom

                showSettings = $('#show-settings');
                gameSelect = $('#game-type');
                gameStart = $('#start-game');
                gameStop = $('.stop-game');
                stopText = $('.stop-text');
                playNow = $('#play-now');
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

                // came from settings dialog
                playNow.on('click', () => onGameStart($('#mode-display').text().toUpperCase()));

                gameStop.on('click', onGameStop);
                gameStart.on('click', () => onGameStart($('#mode-display').text().toUpperCase()));

                $('#game-type-ul li').on('click', (ev) => $('#mode-display').text($(ev.currentTarget).text()));
                showSettings.on('click', (ev) => $('#settings').modal('show'));

                keySig = $('#keysig');
                // TODO add a way to change key signatures from outside of settings dialog
                keySig.on('change', ev => {
                    keyboard.clearAllKeys();
                    MusicSheet.renderStavesEmpty(currentKeySignature()); 
                });

                gameSpeed = $('#game-speed').slider()
                    .on('slide', () => { 
                        if(!!game) game.setSpeed(gameSpeed.getValue()); 
                    }).data('slider');


                // requires a game to exist of course
                dispatcher.on('game::over', (success) => {
                    setTimeout( () => {
                        if(!!game) delete game;
                        displayEndScore(success)
                        afterGameStop();
                    }, 400);
                });

                dispatcher.on('mic::ready', () => gameStart.trigger('click'));
                mic.enable();

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
                let best = parseInt(localStorage['best']) || 0;
                let currentScore = parseInt(game.score) || 0;
                msg = 'Score: ' + currentScore;
                if( currentScore > best ) {
                    localStorage['best'] = currentScore;
                    msg += ' - BEST YET! :-D'
                }
                gameOverMsg.text(msg);
                // allow middle c to close the dialog so user doesn't need to use laptop
                // TODO make this an interval to check the keyboard
                easyDismi$$ = playerPresses.filter((key) => key === keyboard.MIDDLE_C).take(1).subscribe(()=> {
                    gameOver.modal('hide');
                    onPlayAgain();
                });
                gameOver.modal('show');
                $('#play-again').focus();
            }

            function onGameStop() {
                if(!!game) delete game;
                setTimeout(() => {
                    clearUI();
                    afterGameStop();
                }, 500);
            }

            function afterGameStop() {
                gameSelect.closest('.btn-group').show();
                gameStop.hide();
                stopText.hide();
                playNow.text('Save and Play!');
                gameStart.show();
                keySig.prop('disabled', false);
            }

            function currentKeySignature() {
                let chosenKey = keySig.val();
                return chosenKey === 'none' ?  null : chosenKey;
            }


            function onGameStart(selected) { 
                // this should never happen
                if(!!game) delete game;
                clearUI();
                setTimeout(() => beginGame(selected), 400);

            }

            function beginGame(selected) { 
                gameStart.hide(); 
                gameStop.show(); 
                stopText.show(); 
                playNow.text('Save and Restart!');

                let gt = util.gameTypes;
                let mode = gt.names.indexOf(selected);
                switch(mode) {
                    case gt.FLOW:
                    case gt.STAMINA:
                    case gt.SCALES:
                    case gt.SANDBOX:
                        game = new Games.Game({ 
                            type: mode,
                            keyboard: keyboard,
                            keySig: currentKeySignature(),
                            speed: gameSpeed.getValue(),
                            keyHints: $('#keysig-hints').prop('checked'),
                            pianoHints: $('#piano-hints').prop('checked') 
                        });
                        break;
                    case gt.MELODY: // TODO
                    case gt.APT:
                        break;
                }
                gameSpeed.setValue(Math.abs(game.streamSpeed));
                gameSelect.closest('.btn-group').hide();
                keySig.prop('disabled', true);
            }

            var app = new Marionette.Application();
            app.addRegions({
                benches: '#notes'
            });
            
            $(document).ready(startWhistleApp);
});
