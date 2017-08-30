define(['./dispatcher', 'underscore', './audio', 'microphone', './util'], function(dispatcher, _, audio, mic, util) {

    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const noteNames = ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B']; // const != immutable

    const octaveIds = ['0','1','2','3','4','5','6','7','8']; // string on purpose // const != immutable 
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

    class Instrument {
        constructor() {
            this.notesById = Object.freeze(notesById);
        }

        getCurrentNotes() {
            return [notesById['4C']]
        }

    }


    class Whistle extends Instrument {
        
        constructor() {
            super();
            this.noteId = null;
            var self = this;
            dispatcher.on('mic::note', detected => {
                // FIXME this octave is shifted down 2, but we'd rather be able to accurately reflect the notes on the staff. How do vocal scores work?
                self.noteId = ''+(Math.floor(detected.note/12)-2)+noteNames[detected.note%12];
            });
        }

        getCurrentNotes() {
            return this.noteId === null ? [] : [ this.notesById[this.noteId] ]
        }

        // this should only happen once...
        pipe() {
            mic.enable();
        }
    }

    //return Instrument
    return Whistle
});
