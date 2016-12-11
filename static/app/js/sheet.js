define(['jquery', 'rxjs', 'vexflow', './dispatcher', './util'], function($, Rx, Vex, dispatcher, util) {

    const START_NOTE_X = 175; // multiple of both stream speeds means "cutoff" bar graphic looks correct
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
        let VF = Vex.Flow;
        renderer.resize(820, 200);
        let context = renderer.getContext();
        context.setFont("Arial", 10, "").setBackgroundFillStyle("#eed");

        let dummyStave = new VF.Stave(10, 40, 150);
        dummyStave.addClef('treble'); //.addTimeSignature('4/4');

        dummyStave.setNoteStartX(75);
        let rest = new VF.StaveNote({clef: "treble", keys: ["b/4"], duration: "wr" });


        if(!!key) {
            keySig = new VF.KeySignature(key);
            keySig.addToStave(dummyStave);
        }

        dummyStave.setContext(context).draw();
        VF.Formatter.FormatAndDraw(context, dummyStave, [rest]);

        notes = notes.slice(0, 6);

        let stave = new VF.Stave(dummyStave.x+dummyStave.width, 40, 650);

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

        let formatter = new VF.Formatter().joinVoices([voice]).format([voice], 700);
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
