define(['./dispatcher', 'underscore', './audio'], function(dispatcher, _, audio) {

    // TODO add a sortable to keys such that keys are sorted by keyboard order?
    // would allow me to get keys by octave and ensure correct layout for random

    var WHITE=0, BLACK=1;
    var noteNames = ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
    var octaveIds = ['00','0','1','2','3','4','5','6','7']; // string on purpose 

    // TODO MIDDLE C SHOULD BE A KEY, NOT ID
    var MIDDLE_OCTAVE = '3',
        MIDDLE_C = '3C';

    function createKeyboardLayout() {
        var firstOctave = {
            id: '00',
            keys: [{
                    id: '00A',
                    note: 'A',
                    color: WHITE
                }, {
                    id: '00As',
                    note: 'As',
                    color: BLACK
                }, {
                    id: '00B',
                    note: 'B',
                    color: WHITE
                }]
        };

        var lastOctave = {
            id: '07',
            keys: [{
                    id: '7C',
                    note: 'C',
                    color: WHITE
                }]
        };

        function octave(idx) {
            var O = { id: idx, keys: [] };
            for(var k=0; k < noteNames.length; k++) {
                var name = noteNames[k];
                O.keys.push({ 
                    id: '' + idx + name,
                    note: name,
                    color: noteNames[k].indexOf('s') === -1 ? WHITE : BLACK
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

        this.MIDDLE_C = MIDDLE_C;
        this.MIDDLE_OCTAVE = MIDDLE_OCTAVE;

        // only 88-keys for now
        this.octaves = createKeyboardLayout();
        // a way to cross reference from MIDI notes
        this.keys = _.flatten( _.map(this.octaves, function(o) { return o.keys; }));

        // ...and ways to reference keys directly
        this.keysById = new Object; 
        this.keysByNote = new Object;
        this.keysByOctaveId = new Object;

        var self = this;
        _.each(this.keys, function(keyObj) {
            self.keysById[ keyObj.id ] = keyObj;
        });
        _.each(noteNames, function(note) {
            self.keysByNote[note] = _.compact(
                    _.map(octaveIds, function(oId) { 
                        return self.keysById[oId+note]; 
                    }));
        });
        _.each(this.octaves, function(oct) {
            self.keysByOctaveId[oct.id] = oct.keys;
        });

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


    Keyboard.prototype.idxOfId = function(keyId) {
        return this.keys.indexOf(this.keysById[keyId]);
    };


    Keyboard.prototype.playNote = function(key, duration) {
        if(this.output) {
            console.log('MIDI OUTPUT');
            var midiNote = keyboard.keys.indexOf(key)+keyboard.min; // needs wrapper function
            sendMidiNote(midiNote, duration)
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
            _.each(keys, function(key) {
                var midiNote = keyboard.keys.indexOf(key)+keyboard.min; // needs wrapper function
                sendMidiNote(midiNote, duration)
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


    // TODO get the output - how often to do this?
    function sendMidiNote( noteId, duration ) {
        duration = duration || 750.0;
        var output = midiOut; // TODO
        output.send( [0x90, noteId, 0x7f] );  // full velocity
        output.send( [0x80, noteId, 0x40], window.performance.now() + duration ); // note off, half-second delay
    }


    // exports
    return Keyboard;
});
