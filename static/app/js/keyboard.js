define(['jquery', './dispatcher', 'underscore', './audio'], function($, dispatcher, _, audio) {

    var noteNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    var octaveIds = ['00','0','1','2','3','4','5','6','7']; // string on purpose 

    let htmlNoteNames = ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
    let keyAliases = {
        'C': ['Bs'],
        'Cs': ['Db'],
        'Ds': ['Eb'],
        'E': ['Fb'],
        'F': ['Es'],
        'Fs': ['Gb'],
        'Gs': ['Ab'],
        'As': ['Bb'],
        'B': ['Cb']
    };

    function createKeyboardLayout() {
        var firstOctave = {
            id: '00',
            keys: [{
                    id: '00A',
                    octaveId: '00',
                    note: 'A'
                }, {
                    id: '00As',
                    octaveId: '00',
                    note: 'As'
                }, {
                    id: '00B',
                    octaveId: '00',
                    note: 'B'
                }]
        };

        var lastOctave = {
            id: '7',
            keys: [{
                    id: '7C',
                    octaveId: '7',
                    note: 'C'
                }]
        };

        function octave(idx) {
            let oId = ''+idx;
            let O = { id: oId, keys: [] };
            for(let k=0; k < htmlNoteNames.length; k++) {
                let name = htmlNoteNames[k];
                O.keys.push({ 
                    id: oId + name,
                    note: name,
                    octaveId: oId,
                });
            }
            return O;
        }

        var octaves = [ firstOctave ];

        for(var o=0; o < 7; o++) {
            octaves.push(octave(o));
        }
        octaves.push(lastOctave);
        return octaves;
    }


    function Keyboard(opts) {
        var self = this;

        this.midiOut = null;
        this.output = false; // TODO make this an actual MIDI output, not boolean

        // TODO make keyboard respond to settings change just like game does (will)
        this.silent = false;

        this.numKeys = opts.numKeys || 88;
        this.min = opts.min || 21;
        this.max = opts.max || 108;
        this.blacklist = opts.blacklist || [];


        this.noteNames = noteNames;

        // only 88-keys for now
        this.octaves = createKeyboardLayout();
        // a way to cross reference from MIDI notes
        this.keys = _.flatten( _.map(this.octaves, function(o) { return o.keys; }));

        this.keyState = {}

        // ensure each note has an element to play with
        // because ids from the game may not match up to the
        // unique id used for HTML
        this.keys.forEach( key => {
            key.$el = $('#'+key.id);
            // setup state (pressed / not pressed)
            self.keyState[key.id] = false;
        });

        // ...and a way to reference keys directly
        this.keysById = new Object; 
        _.each(this.keys, function(keyObj) {
            self.keysById[ keyObj.id ] = keyObj;
        });


        // ... even if we use an alternate name!
        // WARNING: there may be keys for which there are no notes
        for(let k in keyAliases) {
            for(let kprime of keyAliases[k]) {
                for(let o of octaveIds) {
                    if(!!this.keysById[o+k]) {
                        let oprime = o;
                        if(k === 'C' && kprime ==='Bs' && o !== '00') oprime = octaveIds[octaveIds.indexOf(o)-1];
                        else if(k === 'B' && kprime ==='Cb') oprime = octaveIds[octaveIds.indexOf(o)+1];
                        //console.log("SHIFTING "+this.keysById[o+k].id + " to "+oprime+kprime);
                        this.keysById[oprime+kprime] = this.keysById[o+k];
                    }
                }
            }
        }

        this.MIDDLE_C = this.keysById['3C'];
    }


    Keyboard.prototype.isSameNote = function(k1, k2) {
        k1 = k1.note, k2 = k2.note;
        if(k1 == k2) return true;
        for(let k in keyAliases) {
            for(let kprime of keyAliases[k]) {
                if((k1 == k && k2 == kprime) 
                        || (k2 == k && k1 == kprime))
                    return true
            }
        }
        return false;
    }

    // ===================
    // MIDI Functions
    // ===================
    

    Keyboard.prototype.playNote = function(key, duration) {
        if(this.output) {
            console.log('MIDI OUTPUT');
            var midiNote = this.keys.indexOf(key)+this.min; // needs wrapper function
            sendMidiNote.call(this, midiNote, duration)
        } else {
            audio.playSound('tone-'+key.id); 
            // stop sound if requested
            if(!!duration) {
                setTimeout(function() {
                    audio.stopSound('tone-'+key.id);
                }, duration);
            }
        }
    }

    // These notes are played simultaneously (WARNING: approximate!!)
    Keyboard.prototype.playNotes = function(keys, duration) {
        if(this.output) {
            var self = this;
            _.each(keys, function(key) {
                var midiNote = self.keys.indexOf(key)+self.min; // needs wrapper function
                sendMidiNote.call(self, midiNote, duration)
            });
        } else {
            // play web audio
            _.each(keys, function(key) {
                audio.playSound('tone-'+key.id); 
            });
            // hard stop if requested
            if(!!duration) {
                setTimeout(function() {
                    _.each(keys, function(key) {
                        audio.stopSound('tone-'+key.id); 
                    });
                }, duration);
            }
        }
    }

    Keyboard.prototype.stopNote = function(key) {
    }

    // TODO get the output - how often to do this?
    function sendMidiNote( noteId, duration ) {
        duration = duration || 750.0;
        var output = this.midiOut; // TODO context must be set here...
        output.send( [0x90, noteId, 0x7f] );  // full velocity
        output.send( [0x80, noteId, 0x40], window.performance.now() + duration ); // note off, half-second delay
    }

    // ==================================
    //    State & Graphical Functions
    // ==================================
    
    Keyboard.prototype.numPressed = function() {
        let c=0;
        for(var k in this.keyState) if(this.keyState[k]) c++;
        return c;
    }

    Keyboard.prototype.getPressedKeys = function() {
        let pressed = [];
        for(var k in this.keyState) if(this.keyState[k]) pressed.push(this.keysById[k]);
        return pressed;
    }


    Keyboard.prototype.isPressed = function(key) {
        return this.keyState[key.id];
    }

    Keyboard.prototype.isPressedById = function(keyId) {
        return this.keyState[keyId];
    }

    // FIXME to handle the new scheme where id may not be in HTML, set $el or elem on key object during construction
    Keyboard.prototype.colorKey = function(key, clazz, duration) {
        key.$el.addClass(clazz);
        if(!!duration) setTimeout(function() {
            key.$el.removeClass(clazz);
        }, duration);
    }


    Keyboard.prototype.pressKey = function(key) {
        this.keyState[key.id] = true;
        key.$el.addClass('pressed');
    }

    // FIXME This is a hack to release the key but keep it
    // delay changing the UI, so that keypresses longer
    // than game update rate don't count as failures.
    Keyboard.prototype.ignoreKeyState = function(key) {
        this.keyState[key.id] = false;
    }

    Keyboard.prototype.releaseKey = function(key) {
        this.keyState[key.id] = false;
        key.$el.removeClass('pressed');
    }

    Keyboard.prototype.clearKey = function(key) {
        key.$el.removeClass('waiting success failure pressed'); // clearing pressed may be a mistake
    }


    Keyboard.prototype.clearAllKeys = function(key) {
        this.keys.forEach(this.clearKey);
    }


    Keyboard.prototype.activateKey = function(key) {
        this.colorKey(key, 'waiting'); 
    }


    Keyboard.prototype.successKey = function(key) {
        this.colorKey(key, 'success', 200);
        if(!this.silent) this.playNote(key);
    };


    Keyboard.prototype.failKey = function(key) {
        this.colorKey(key, 'failure', 200);
        if(!this.silent) this.playNote(this.keysById['0C']);
    };


    Keyboard.prototype.failKeyForever = function(key) {
        this.pressKey(key);
        this.colorKey(key, 'failure');
        if(!this.silent) this.playNote(this.keysById['0C']);
    };


    // exports
    return Keyboard;
});
