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

// TODO we need a graphical indicator of WHEN to press the key, for melody especially
// FIXME now that keypresses result in handleCommand, no keyup is displayed - what was previous logic?
// FIXME on game success, we need to create another one if it is destroyed
// TODO if no game exists (whut) pass handleCommand to the keyboard - requires that I move all music handling into keyboard first
// TODO rename ui::clear to indicate that it only clears keyboard keys, NOT score meter or other game related information
// FIXME melody game stop results in hanging activated notes

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

            var midi = null,
                midiOut = null;

            var stopGame, 
                gameSelect, 
                scoreMeter;


            function startPianoApp() {

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

                            // FIXME this is all hackery
                            isConnected = true; 
                            $('#is-connected').prop('checked', 'checked');
                        }
                    }
                    for (var entry of midi.outputs) {
                        var output = entry[1];
                        console.log('OUTPUT ' + output.name + ' ::: ' + output.id);
                        if(output.id === '37404369B80CF4EF4EC25AF434890FD1792FFD304E48EEE6E57D6D5430B5378A') {
                            output.open();
                            midiOut = output;
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
                    if(!game) return;
                    toneId = $(this).attr('id');
                    var key = keyboard.keysById[toneId];

                    // TODO remove state here, should be internal to game
                    // always just handle the command, pass through the input
                    console.log('game state is ' + game.state);
                    switch(game.state) {
                        case gameStates.ANIMATING:
                            ev.stopPropagation();
                            ev.preventDefault();
                            break;
                        case gameStates.INPUT_CONTROL:
                            handleCommand('option', key);
                            break;
                        default:
                            handleCommand('on', key);
                            break;
                    }
                 });


                // TODO understand the audio channels, and why stop is broken
                $(".white").mouseup(function () {
                    toneId = $(this).attr('id');
                        //stop_multi_sound('tone-'+toneId, 'mouse');
                 });


                gameSelect.on('change', onGameSelect);
                stopGame.on('click', onGameStopPress);

                ws = new WebSocket('ws://localhost:8888');

                // ensure game is created on page load
                gameSelect.trigger('change');
            }


            // TODO FIXME stop all notes playing (has race condition, or lack of delay)
            // maybe try using a callback after failure
            // This will be a view later
            function onGameSelect(ev) { 
                if(!!game) delete game;

                var gType = parseInt(this.value);
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

                    playNotes(keyboard.keys, 5000.0);

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
                duration = duration || 750.0;
                var output = midiOut; // TODO
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
                            audioChannels[a]['finished'] = now.getTime() + 1000;
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

            
            // Why does this stuff exist again?

            // TODO make this a part of game, game should handle it's own command
            function handleCommand(command, key) {
                switch(command) {
                    case 'option': // selecting an option (such as start game)
                        $('#'+key.id).addClass('pressed');
                        if(!!game) game.playerInput(key);
                        break;
                    case 'on':
                        $('#'+key.id).addClass('pressed');
                        playNote(key);
                        if(!!game) game.playerInput(key);
                        break;
                    case 'off':
                        $('#'+key.id).removeClass('pressed');
                        break;
                }
            }

            function onMIDIMessage( event ) {
                if(!game) return;

                // Uint8Array?
                var midiData = event.data;

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
                
                // TODO remove external switch on game state, should be handled by the game
                switch(game.state) {
                    case gameStates.ANIMATING:
                        break;
                    case gameStates.INPUT_CONTROL:
                        if(command === 'on') command = 'option';
                        handleCommand(command, key);
                        break;
                    default:
                        handleCommand(command, key);
                        break;
                }
            }


            var app = new Marionette.Application();
            app.addRegions({
                benches: '#notes'
            });
            
            $(document).ready(startPianoApp);
});
