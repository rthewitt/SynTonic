define(['jquery', 'rxjs', 'vexflow', './dispatcher', './util'], function($, Rx, Vex, dispatcher, util) {

    const START_NOTE_X = 120; // multiple of both stream speeds means "cutoff" bar graphic looks correct
    const TREBLE_BAR_HEIGHT = 25;
    const UNDERBAR = 177;
    const CANVAS_WIDTH = 600;
    //  from keyboard:  ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
    //const NOTES_POS_H = [175, 175, 163, 163, 150, 138, 138, 125, 125, 113, 113, 100];
    const NOTES_POS_H = [184, 184, 172, 172, 157, 145, 145, 132, 132, 120, 120, 107];
    const NOTE_COLORS = {
        //'active': '#CCFF33',
        'active': 'yellow', // more pronounced than piano key active color
        'hint': 'blue',
        'failure': '#FF3357',
        'success': '#46EC00'
    };

    const activeStyle = { shadowColor: NOTE_COLORS['active'], shadowBlur: 10 }
    const modStyle = { fillStyle: NOTE_COLORS['hint'] };
    const activeModStyle = Object.assign({}, activeStyle, modStyle);

    // vex
    var renderer;


    function renderVex(notes, key, pos) {
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

        if(!!key) {
            keySig = new VF.KeySignature(key);
            keySig.addToStave(stave);
        }

        stave.setContext(context).draw();
        stave.setNoteStartX(pos);

        // TODO change note names, separate octave from id or reverse order truncate zero-pad
        // FIXME note that octave id is not zero based in vexflow
        // color the note appropriately (active / modifier hints)
        let vexNotes = notes.map( n => n.vexNote );
        if(vexNotes.length) {
            vexNotes.forEach( (vn,vi) => {
                if(vi === 0) vn.setStyle(activeStyle);
                vn.keyProps.forEach( (n,i) => {
                    if(n.signatureKeyHint) {
                        vn.setKeyStyle(i, vi === 0 ? activeModStyle : modStyle);
                    }
                });
            });
        }


        let voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
        voice.setStrict(false); // remove tick counting, we aren't using measures
        voice.addTickables(vexNotes);

        let formatter = new VF.Formatter().joinVoices([voice]).format([voice], 800);
        voice.draw(context, stave);
    }

    return {
        init: function(instrument) { 
                  renderer = new Vex.Flow.Renderer($('#vex-canvas')[0], 
                          Vex.Flow.Renderer.Backends.CANVAS);
                  keyboard = instrument; 
              },
        startNoteX: START_NOTE_X,
        noteColors: NOTE_COLORS,
        renderVex: renderVex
    }


});
