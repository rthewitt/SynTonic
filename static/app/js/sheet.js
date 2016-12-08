define(['jquery', 'rxjs', 'vexflow', './dispatcher', './util'], function($, Rx, Vex, dispatcher, util) {

    const START_NOTE_X = 120; // multiple of both stream speeds means "cutoff" bar graphic looks correct
    const TREBLE_BAR_HEIGHT = 25;
    const UNDERBAR = 177;
    const CANVAS_WIDTH = 600;
    //  from keyboard:  ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
    //const NOTES_POS_H = [175, 175, 163, 163, 150, 138, 138, 125, 125, 113, 113, 100];
    const NOTES_POS_H = [184, 184, 172, 172, 157, 145, 145, 132, 132, 120, 120, 107];
    const NOTE_COLORS = {
        'active': '#CCFF33',
        'failure': '#FF3357',
        'success': '#46EC00'
    }

    // vex
    var renderer;

     // Note: object to be rendered on staff
     // has pointer to relevant key
     // TODO replace entirely with StaveNote, use global position, keep a context
    function Note(id) {
        let VF = Vex.Flow;
        this.status = null;
        this.key = keyboard.keysById[id];
        // TODO stop cheating, this is dishonest progress
        this.vexNote = new VF.StaveNote({ clef: 'treble', keys: [this.key.note.replace('s', '#')+'/4'], duration: 'h', auto_stem: true });
        var self = this;
        this.vexNote.keys.forEach( (n,i) => {
            console.log('n='+n);
            if(n.indexOf('#') !== -1) {
                self.vexNote.addAccidental(i, new VF.Accidental("#"));
            }
        });
    }


    function renderVex(notes, pos) {
        if(typeof pos === 'undefined') pos = START_NOTE_X;
        // It seems like adding a set number makes things somewhat smoother - and the more we have the smoother
        // if we lengthen the formatted width, we get the same skip
        // WHY? is it because we briefly render without adding another note? Is it state mutation from shifting? 
        notes = notes.slice(0, 6);
        let VF = Vex.Flow;
        renderer.resize(820, 200);
        let context = renderer.getContext();
        context.setFont("Arial", 10, "").setBackgroundFillStyle("#eed");

        let stave = new VF.Stave(10, 40, 800);
        stave.addClef('treble'); //.addTimeSignature('4/4');

        // key signature test
        keySig = new VF.KeySignature($('#keysig').val());
        keySig.addToStave(stave);

        stave.setContext(context).draw();
        stave.setNoteStartX(pos);

        // TODO change note names, separate octave from id or reverse order truncate zero-pad
        // FIXME note that octave id is not zero based in vexflow
        let vexNotes = notes.map( n => n.vexNote );

        let voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
        voice.setStrict(false); // remove tick counting, we aren't using measures
        voice.addTickables(vexNotes);

        let formatter = new VF.Formatter().joinVoices([voice]).format([voice], 800); // justify to 400 pixels
        voice.draw(context, stave);
    }

    return {
        init: function(instrument) { 
                  renderer = new Vex.Flow.Renderer($('#vex-canvas')[0], 
                          Vex.Flow.Renderer.Backends.CANVAS);
                  keyboard = instrument; 
              },
        Note: Note,
        startNoteX: START_NOTE_X,
        renderVex: renderVex
    }


});
