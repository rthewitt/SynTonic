define(['jquery', './dispatcher', 'underscore', './audio', './util'], function($, dispatcher, _, audio, util) {

    const octaveIds = ['0','1','2','3','4','5','6','7','8']; // string on purpose // const != immutable 
    const htmlNoteNames = ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B']; // const != immutable
    const noteAliases = Object.freeze({
        'C':  ['Bs'],
        'Cs': ['Db'],
        'Db': ['Cs'],
        'D':  [],
        'Ds': ['Eb'],
        'Eb': ['Ds'],
        'E':  ['Fb'],
        'Fb': ['E' ],
        'F':  ['Es'],
        'Es': ['F' ],
        'Fs': ['Gb'],
        'Gb': ['Fs'],
        'G':  [],
        'Gs': ['Ab'],
        'Ab': ['Gs'],
        'A':  [],
        'As': ['Bb'],
        'Bb': ['As'],
        'B':  ['Cb'],
        'Cb': ['B' ]
    });

    var allNotes = [];
    octaveIds.forEach( oId => {
        allNotes = allNotes.concat(
            util.allNoteNames.map(n => ({ id: ''+oId+n, name: n, octave: oId }))
        );
    });

    var notesById = _.indexBy(allNotes, 'id');



    // TODO remove string based ids for octaves
    function PianoKey(noteId) {
        let baseNote = notesById[noteId];

        this.id = 'pk-'+baseNote.id;
        this.octave = baseNote.octave;
        this.notes = [];
        this.baseNote = baseNote; // easy id retrieval
        this.addNote(baseNote);

        let name = baseNote.name, oId = this.octave;
        let aliasNotes = noteAliases[name].map( alias => {
            let shiftDown = name === 'C' && alias === 'Bs' && oId !== '0';
            let shiftUp = name === 'B' && alias === 'Cb';
            let octaveId = shiftDown ? octaveIds.indexOf(oId)-1 : shiftUp ? octaveIds.indexOf(oId)+1 : oId;
            return notesById[''+octaveId+alias];
        });
        aliasNotes.forEach(n => this.addNote(n));
    }

    PianoKey.prototype.addNote = function(note) {
        if(!!note.pianoKey) throw "Note already accounted for! note="+note.id+" note.pianoKey="+note.pianoKey.id+" thisKey="+this.id;
        note.pianoKey = this;
        if(this.notes.indexOf(note) !== -1) throw "this key ("+this.id+") already contains note "+note.id;
        this.notes.push(note);
    }



    function Keyboard(opts) {

        this.midiOut = null;
        this.output = false; // TODO make this an actual MIDI output, not boolean
        this.silent = false; // TODO

        this.numKeys = opts.numKeys || 88;
        this.min = opts.min || 21;
        this.max = opts.max || 108;
        this.blacklist = opts.blacklist || [];

        // a way to cross reference from MIDI notes (index)
        const firstOctave = {
            id: '0',
            keys: ['0A','0As','0B'].map( id => new PianoKey(id) )
        };

        const lastOctave = {
            id: '8',
            keys: [ new PianoKey('8C') ]
        };

        let octaves = [ firstOctave ];
        octaves = octaves.concat(octaveIds.slice(1,7).map( oId => 
            ({
                id: oId,
                keys: htmlNoteNames.map( name => new PianoKey(''+oId+name) )
            })
        ));
        octaves.push(lastOctave);

        this.octaves = octaves;
        this.keys = _.flatten( octaves.map( o => o.keys )).map(key => {
            key.$el = $('#'+key.id);
            return Object.freeze(key)
        });
        this.keysById = Object.freeze(_.indexBy(this.keys, 'id'));
        this.notesById = Object.freeze(notesById); // TODO FIXME this is still not idempotent in the case of two keyboards, must clone notes during construction.

        // updateable state of which keys are currently pressed
        var keyState = {};
        this.keys.forEach( key => {
            keyState[key.id] = false; 
        });

        this.keyState = keyState;
        this.MIDDLE_C = this.notesById['4C'].pianoKey;
    }


    // ===================
    // MIDI Functions
    // ===================
    

    // FIXME note.id may not map to a tone, we should do note.pianoKey.baseNote or dictionary lookup for tones
    Keyboard.prototype.playNote = function(note, duration) {
        //console.log('playing tone '+note.id);
        if(this.output) {
            console.log('MIDI OUTPUT');
            var midiNote = this.keys.indexOf(note.pianoKey)+this.min; // notes is larger than keys, so we must use correct index
            sendMidiNote.call(this, midiNote, duration)
        } else {
            audio.playSound('tone-'+note.id); 
            // stop sound if requested
            if(!!duration) {
                setTimeout(function() {
                    audio.stopSound('tone-'+note.id);
                }, duration);
            }
        }
    }

    /* FIXME note.id may not map to a tone, see above. also function not used at this point.
    // These notes are played simultaneously (WARNING: approximate!!)
    Keyboard.prototype.playNotes = function(notes, duration) {
        if(this.output) {
            var self = this;
            _.each(notes, function(note) {
                var midiNote = self.keys.indexOf(note.pianoKey)+self.min; // needs wrapper function
                sendMidiNote.call(self, midiNote, duration)
            });
        } else {
            // play web audio
            _.each(notes, function(note) {
                audio.playSound('tone-'+note.id); 
            });
            // hard stop if requested
            if(!!duration) {
                setTimeout(function() {
                    _.each(notes, function(note) {
                        audio.stopSound('tone-'+note.id); 
                    });
                }, duration);
            }
        }
    }

    Keyboard.prototype.stopNote = function(key) {
    }
    */

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

    Keyboard.prototype.getPressed = function() {
        return Object.values(this.keyState).filter(p => !!p);
        /*
        let pressed = [];
        for(var k in this.keyState) if(this.keyState[k]) pressed.push(this.keysById[k]);
        return pressed;
        */
    }


    Keyboard.prototype.isPressed = function(key) {
        return this.keyState[key.id];
    }

    Keyboard.prototype.isPressedById = function(keyId) {
        return this.keyState[keyId];
    }

    Keyboard.prototype.colorKey = function(key, clazz, duration) {
        key.$el.addClass(clazz);
        if(!!duration) setTimeout(function() {
            key.$el.removeClass(clazz);
        }, duration);
    }


    Keyboard.prototype.pressKey = function(key, pressInfo) {
        this.keyState[key.id] = Object.freeze(pressInfo) 
            || Object.freeze({ key: key, fromNote: false }); // TODO this looks like future complexity
        key.$el.addClass('pressed');
        if(!this.silent) this.playNote(key.baseNote);
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
        //this.colorKey(key, 'success', 200);
        this.colorKey(key, 'success');
    };


    Keyboard.prototype.failKey = function(key) {
        //this.colorKey(key, 'failure', 200);
        this.colorKey(key, 'failure');
    };


    // TODO remove this if it stays identical to failKey
    Keyboard.prototype.failKeyForever = function(key) {
        this.colorKey(key, 'failure');
    };


    // IMPORTANT: This is not idempotent, only once keyboard can be created.
    // if we return an object from the module, we won't be able to accept
    // user guidance on model / number of octaves, etc
    // TODO FIXME make sure we clone notesById / allNotes instead of mutating them in place
    
    // exports
    return Keyboard;
});
