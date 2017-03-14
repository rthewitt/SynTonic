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
                    note: 'A'
                }, {
                    id: '00As',
                    note: 'As'
                }, {
                    id: '00B',
                    note: 'B'
                }]
        };

        var lastOctave = {
            id: '07',
            keys: [{
                    id: '7C',
                    note: 'C'
                }]
        };

        function octave(idx) {
            var O = { id: idx, keys: [] };
            for(var k=0; k < htmlNoteNames.length; k++) {
                var name = htmlNoteNames[k];
                O.keys.push({ 
                    id: '' + idx + name,
                    note: name
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

        this.midiOut = null;
        this.output = false; // TODO make this an actual MIDI output, not boolean
        this.silent = false; // currently game controls whether we make a noise

        this.numKeys = opts.numKeys || 88;
        this.min = opts.min || 21;
        this.max = opts.max || 108;
        this.blacklist = opts.blacklist || [];


        this.noteNames = noteNames;

        // only 88-keys for now
        this.octaves = createKeyboardLayout();
        // a way to cross reference from MIDI notes
        this.keys = _.flatten( _.map(this.octaves, function(o) { return o.keys; }));

        // ensure each note has an element to play with
        // because ids from the game may not match up to the
        // unique id used for HTML
        this.keys.forEach( key => {
            key.$el = $('#'+key.id);
        });

        // ...and a way to reference keys directly
        this.keysById = new Object; 
        var self = this;
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

        // TODO visualy inspect each and every note after this construction

        this.MIDDLE_C = this.keysById['3C'];

        // handle keys
        dispatcher.on('key::press', function(key) {
            $('#' + key.id).addClass('pressed');
            if(!self.silent) self.playNote(key);
        });
        dispatcher.on('key::release', function(key) {
            $('#' + key.id).removeClass('pressed');
            if(!self.silent) self.stopNote(key); // how to handle this?
        });
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
    

    // ===================
    // Graphical Functions
    // ===================
    

    // FIXME to handle the new scheme where id may not be in HTML, set $el or elem on key object during construction
    Keyboard.prototype.colorKey = function(key, clazz, duration) {
        key.$el.addClass(clazz);
        if(!!duration) setTimeout(function() {
            key.$el.removeClass(clazz);
        }, duration);
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
    };


    Keyboard.prototype.failKey = function(key) {
        this.colorKey(key, 'failure', 200);
    };

    Keyboard.prototype.failKeyForever = function(key) {
        this.colorKey(key, 'failure');
    };


    // exports
    return Keyboard;
});
