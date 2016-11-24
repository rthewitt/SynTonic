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


require([ 'jquery', 'underscore', 'rxjs', 'backbone', 'marionette', 'mustache', './game', './sheet', 'keyboard',
        './dispatcher', './audio', './util', './config',
        // consume
        'bootstrap'
        ], function($, _, Rx, Backbone, Marionette, Mustache, Games, MusicSheet, Keyboard, dispatcher, audio, util, config) {


            // FIXME REMOVE
            window.doRelay = function() { dispatcher.trigger('game::relay'); }

            var game = null;
            var ws = null;

            // FIXME remove this, or document blacklist in UI
            var keyboard = window.KB = new Keyboard({ blacklist: [98] });

            var gameOver,
                gameOverMessage,
                showSettings;

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
                // TODO move this into keyboard
                let mouseKeyDowns = Rx.Observable.fromEvent($('.white, .black'), 'mousedown').map(ev => keyboard.keysById[ev.target.id]);
                let mouseKeyUps = Rx.Observable.fromEvent($('.white, .black'), 'mouseup').map(ev => keyboard.keysById[ev.target.id]);

                if(!!midiInput) {
                    let midiMessages = Rx.Observable.fromEvent(midiInput, 'midimessage').map(parseMidi);
                    let midiKeyDowns = midiMessages.filter((data) => data.command === 'on').pluck('key');
                    let midiKeyUps = midiMessages.filter((data) => data.command === 'off').pluck('key');

                    playerPresses = Rx.Observable.merge(mouseKeyDowns, midiKeyDowns);
                    playerReleases = Rx.Observable.merge(mouseKeyUps, midiKeyUps);
                } else {
                    playerPresses = mouseKeyDowns;
                    playerReleases = mouseKeyUps;
                }
            }


            function removeInputHandlers(mAccess) {
            }


            function onMidiSuccess(mAccess) {
                midi = window.MIDI = mAccess;
                for (var entry of midi.inputs) {
                    var input = entry[1];
                    console.log('found midi input ' + input.name + ' ::: ' + input.id);
                    if(input.id === 'D236B183A211441B323363DFA0572EDB190FA7BC961CAB61DE989CBCDC6C5D67') {
                        console.log('TODO create a dropdown select for input/output');
                        midiInput = input;
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
                setupInputHandlers();
                dispatcher.trigger('game::select', 'FLOW');
            }


            function onMidiFailure(msg) {
                console.log('Failed to get MIDI access - ' + msg);
            }




            function startPianoApp() {

                // TODO move everything keyboard related into keyboard
                // so that we can pass instrument into the Game constructor once again
                // (e.g., clearAllKeys and other UI functions)
                MusicSheet.init(keyboard); // set up the Dom

                showSettings = $('#show-settings');
                gameOver = $('#gameover');
                gameOverMsg = $('#game-over-message');

                gameOver.on("hidden.bs.modal", onPlayAgain);

                $('#game-type-ul li').on('click', function(){
                    dispatcher.trigger('game::select', $(this).text().toUpperCase());
                });
                dispatcher.on('game::select', onGameSelect);
                showSettings.on('click', (ev) => $('#settings').modal('show'));

                // requires a game to exist of course
                dispatcher.on('game::over', displayEndScore);

                // for system exclusive messages, pass opts: { sysex: true }
                navigator.requestMIDIAccess().then(onMidiSuccess, onMidiFailure);

                $('#use-instrument').change(function() {
                    keyboard.output = $(this).prop('checked');
                });

                ws = new WebSocket('ws://localhost:8888');
            }


            function onPlayAgain(ev) {
                if(!!easyDismi$$) {
                    easyDismi$$.dispose();
                    easyDismi$$ = null;
                }
                gameOver.modal('hide');
                gameOverMsg.text('');
                dispatcher.trigger('game::select', util.gameTypes.names[game.type]);
                // at the very least, just create a function for newGame and call that
            }


            function displayEndScore (success) {
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
                easyDismi$$ = playerPresses.filter((key) => key.id === keyboard.MIDDLE_C).take(1).subscribe(()=> {
                    gameOver.modal('hide');
                });
                gameOver.modal('show');
                $('#play-again').focus();
            }


            function onGameSelect(selected) { 
                if(!!game) {
                    game.cleanup(); // avoid memory leaks
                    delete game;
                }

                let gt = util.gameTypes;
                let mode = gt.names.indexOf(selected)
                switch(mode) {
                    case gt.FLOW:
                    case gt.STAMINA:
                        // TODO move instrument midiInput into Keyboard!
                        game = new Games.Flow({ 
                            type: mode,
                            keyboard: keyboard,
                            playerPresses: playerPresses,
                            playerReleases: playerReleases
                        });
                        break;
                    case gt.MELODY: // TODO
                    case gt.APT:
                        break;
                }

            }

            var app = new Marionette.Application();
            app.addRegions({
                benches: '#notes'
            });
            
            $(document).ready(startPianoApp);
});
