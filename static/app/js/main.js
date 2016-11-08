require.config({
    paths: {
        "jquery": ["http://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min", 
                    "libs/jquery/dist/jquery.min"],
        "bootstrap": "libs/bootstrap-dist/bootstrap.min",
        "underscore": "libs/underscore/underscore",
        "backbone": "libs/backbone/backbone",
        "mustache": "libs/mustache/mustache",
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


/*
 * TODO 
 * Move this webaudio and webmidi and agnostic function cruft into the keyboard object
 * let the keyboard handle itself, it isn't just an immutable data structure
 * it is also behavior encapsulation.
 */


require([ 'jquery', 'underscore', 'backbone', 'marionette', 'mustache', './game', './keyboard',
        './dispatcher', './util', './config',
        // consume
        'bootstrap'
        ], function($, _, Backbone, Marionette, Mustache, GameMaker, Keyboard, dispatcher, util, config) {


            var game = null;
            var ws = null;

            // FIXME remove this, or document blacklist in UI
            var keyboard = window.KB = new Keyboard({ blacklist: [98] });

            var games = util.gameTypes,
                gameStates = util.gameStates;

            // This comes into play during game construction to set up
            // timeouts that make sense for the instrument
            // This should be moved into the UI, because the timeouts make no sense
            var isConnected = false;
            var midi = null;

            var startGame, 
                stopGame, 
                scoreMeter;


            function startPianoApp() {

                startGame = $('#start-game');
                stopGame = $('#stop-game');
                scoreMeter = $('#score-meter');

                setupGameEvents();

                function listMidiIO() {
                    // TODO add these to dropdown of some sort
                    for (var entry of midi.inputs) {
                        var input = entry[1];
                        console.log('found midi input ' + input.name);
                    }
                    for (var entry of midi.outputs) {
                        var output = entry[1];
                        console.log('found midi output ' + output.name);
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
                navigator.requestMIDIAccess({ sysex: true }).then(onMidiSuccess, onMidiFailure);


                $(".white, .black").mousedown(function (ev) {
                    toneId = $(this).attr('id');
                    var key = keyboard.keysById[toneId];

                    if(!!game) {
                        if(!!game) game.playerInput(key);
                        switch(game.state) {
                            case gameStates.ANIMATING:
                                ev.stopPropagation();
                                ev.preventDefault();
                                break;
                            case gameStates.INPUT_CONTROL:
                                alert('TODO');
                                break;
                            default:
                                playNote(key);
                                break;
                        }
                    } else playNote(key);
                 });


                // TODO understand the audio channels, and why stop is broken
                $(".white").mouseup(function () {
                    toneId = $(this).attr('id');
                        //stop_multi_sound('tone-'+toneId, 'mouse');
                 });


                startGame.on('click', onGameStartPress);
                stopGame.on('click', onGameStopPress);

                function handleCommand(command) {
                    switch(command) {
                        case 'on':
                            $('#'+key.id).addClass('pressed');
                            if(!!game) game.playerInput(key);
                            break;
                        case 'off':
                            $('#'+key.id).removeClass('pressed');
                            break;
                    }
                }

                ws = new WebSocket('ws://localhost:8888');
                ws.onmessage = function(ev) {
                    //console.log(JSON.parse(ev.data));
                    if(ev.data instanceof Blob) {
                        if(ev.data.size !== 3) {
                            console.log('This buffer is not expected length...');
                            return;
                        }

                        var reader = new FileReader();
                        reader.onload = function(e) {
                            //console.log(reader.result);
                            var midiBuffer = reader.result;
                            console.log("byte length "+midiBuffer.byteLength);
                            var midiData = new Uint8Array(midiBuffer);

                            var command;

                            var first = midiData[0],
                                note = midiData[1],
                                velocity = midiData[2];

                            if(first == 0x90) {
                                command = velocity == 0x0 ? 'off' : 'on';

                            } else if(first == 0x80) command = 'off';
                            else command = 'unknown command';

                            console.log(command);
                            console.log(note);
                            console.log(velocity);

                            key = keyboard.keys[note-keyboard.min];

                            switch(game.state) {
                                case gameStates.ANIMATING:
                                    break;
                                case gameStates.INPUT_CONTROL:
                                    alert('TODO');
                                    break;
                                default:
                                    handleCommand(command);
                                    break;
                            }
                        }
                        reader.readAsArrayBuffer(ev.data);
                    }
                };

            }


            // TODO FIXME stop all notes playing (has race condition, or lack of delay)
            // maybe try using a callback after failure
            // This will be a view later
            function onGameStartPress(ev) { 
                startGame.hide();
                if(!!game) delete game;

                var gType = parseInt($('#game-type').val());
                var gameOpts = {
                    keyboard: keyboard,
                    connected: isConnected
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
                stopGame.show();
                game.start();
            }


            function onGameStopPress(ev) { 
                    if(!!game) {
                        game.stop();
                        delete game;
                        stopGame.hide();
                        startGame.show();
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
                    playNote(key);
                    setTimeout(function() {
                        playNotesRecursive(q, clazz, cb);
                    },40);
                } else cb();
            }


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

                // TODO view will have a form, all model change listeners
                dispatcher.on('game::score', function(score) {
                    console.log('cur: '+score.current + '\nmax: '+score.max);
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

                    playNotes(keyboard.keys, 5000.0);

                    // I gather that:
                    // There was a bug were I was unable to stop the audio
                    // I cannot verfiy this and the stop is set to 5 seconds
                    // which was either a mistake or a response to long press
                    // comment suggested I could distract the user
                    // FIXME we could avoid this timing business if STOP
                    // event handled both the UI and the audio clear
                    // this onFinish smells like callback hell
                    setTimeout(function() {
                        dispatcher.trigger('ui::reset');
                        ev.onFinish();
                    }, 5000);

                });


                dispatcher.on('ui::reset', function() {
                    stopGame.hide();
                    startGame.show();
                    clearKeys();
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


                // Activate in this context means play the note(s) and color them (currently yellow)
                dispatcher.on('game::activate', function(data) {
                    setTimeout(function() { 
                        colorKeys(data.keys, 'waiting'); 
                        if(data.sound) {
                            console.log($('#use-instrument').prop('checked'));
                            if($('#use-instrument').prop('checked')) {
                                _.each(data.keys, function(key) {
                                    var midiNote = keyboard.keys.indexOf(key)+keyboard.min; // needs wrapper function
                                    sendMidiNote(midiNote)
                                });
                            } else {
                                _.each(data.keys, function(key) {
                                    play_multi_sound('tone-'+key.id); 
                                });
                            }
                        }
                    }, (data.when || 0));
                });


                dispatcher.on('game::won', function(ev) {
                    stopGame.hide();

                    var kb = keyboard,
                    keyRange = _.range(Math.floor((kb.max-kb.min)/2), kb.max-kb.min + 1);

                    var cb = function() {
                        startGame.show();
                        ev.onFinish();
                    };
                    playNotesRecursive(keyRange, 'pressed success', cb);
                });
            }

            // ===========================
            // WEB MIDI API AND FUNCTIONS
            // ===========================

            // TODO get the output - how often to do this?
            function sendMidiNote( noteId, duration ) {
                duration = duration || 500.0;
                var output = midi.outputs.get('-779048262');
                console.log('OUTPUT ' + output.name);
                output.open();
                output.send( [0x90, noteId, 0x7f] );  // full velocity
                output.send( [0x80, noteId, 0x40], window.performance.now() + duration ); // note off, half-second delay
            }

            // ===========================
            // WEB AUDIO API AND FUNCTIONS
            // ===========================
            
            var channel_max = 32;										// number of channels
            audioChannels = new Array();

            for (var a=0;a<channel_max;a++) {									// prepare the channels
                audioChannels[a] = new Array();
                audioChannels[a]['channel'] = new Audio();						// create a new audio object
                audioChannels[a]['finished'] = -1;							// expected end time for this channel
                audioChannels[a]['keyvalue'] = '';
            }



            // Why is this in underscore notation?
            // TODO answer questions
            // 1) when do I want multisound vs MIDI play?
            // 2) can WebAudio listen to MIDI Api to avoid low-level play?
            function play_multi_sound(s) {
                for (var a=0; a < audioChannels.length; a++) { 
                    var now = new Date(); 
                    if(audioChannels[a]['finished'] < now.getTime()) { // is this channel finished?
                        
                        try {		
                            audioChannels[a]['finished'] = now.getTime() + document.getElementById(s).duration*1000;
                            audioChannels[a]['channel'] = document.getElementById(s);
                            audioChannels[a]['channel'].currentTime = 0;
                            audioChannels[a]['channel'].volume=1;
                            audioChannels[a]['channel'].play();
                            audioChannels[a]['keyvalue'] = s; 
                        } catch(v) {
                            console.log(v.message); 
                        }
                        break;
                    }
                }
            }


            function channelStop(idx, when, dropVolume) {
                if(dropVolume) audioChannels[a]['channel'].volume=0;
                setTimeout(function() {
                    try {
                        audioChannels[idx]['channel'].pause()
                        audioChannels[idx]['channel'].currentTime = 0;
                    } catch(ex) { console.log(ex); }
                }, when);
            }

            function stop_multi_sound(s, sender) { 
                for (var a=0; a < audioChannels.length; a++) { 
                    if (audioChannels[a]['keyvalue'] == s) { // is this channel finished?
                        try { 
                            audioChannels[a]['channel'] = document.getElementById(s);
                            var wasMouse = sender != undefined && sender == 'mouse';
                            channelStop(a, wasMouse ? 2500 : 500, wasMouse);
                        } catch(v) {	
                            console.log(v.message); 
                        }
                        break;
                    }
                }
            }

            // ===========================
            // API AGNOSTIC FUNCTIONS
            // ===========================
            // duplication for optimization on check
            // soon this check will be uncecessary (read synth source code)

            function playNote(key, duration) {
                if($('#use-instrument').prop('checked')) {
                    var midiNote = keyboard.keys.indexOf(key)+keyboard.min; // needs wrapper function
                    sendMidiNote(midiNote, duration)
                } else {
                    play_multi_sound('tone-'+key.id); 
                    // stop sound if requested
                    if(!!duration) {
                        setTimeout(function() {
                            stop_multi_sound('tone-'+key.id);
                        }, duration);
                    }
                }
            }

            // These notes are played simultaneously (WARNING: approximate!!)
            function playNotes(keys, duration) {
                if($('#use-instrument').prop('checked')) {
                    _.each(keys, function(key) {
                        var midiNote = keyboard.keys.indexOf(key)+keyboard.min; // needs wrapper function
                        sendMidiNote(midiNote, duration)
                    });
                } else {
                    // play web audio
                    _.each(keys, function(key) {
                        play_multi_sound('tone-'+key.id); 
                    });
                    // hard stop if requested
                    if(!!duration) {
                        setTimeout(function() {
                            _.each(keys, function(key) {
                                stop_multi_sound('tone-'+key.id); 
                            });
                        }, duration);
                    }
                }
            }

            // TODO: consider if a timeout sound makes sense for keyboard
            // when I support different sorts, may only have one octave
            // so we need to ensure that a default stragey like web audio is present
            function soundBuzzer() {
                play_multi_sound('buzzer');
            }


            var app = new Marionette.Application();
            app.addRegions({
                benches: '#notes'
            });
            
            $(document).ready(startPianoApp);
});
