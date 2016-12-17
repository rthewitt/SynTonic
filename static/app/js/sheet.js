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
        'active': 'orange', // more pronounced than piano key active color
        'hint': 'blue',
        'failure': '#FF3357',
        'success': '#46EC00'
    };

    const activeStyle = { fillStyle: NOTE_COLORS['active'], strokeStyle: NOTE_COLORS['active'] }
    const modStyle = { shadowColor: NOTE_COLORS['hint'], shadowBlur: 15 };
    const activeModStyle = Object.assign({}, activeStyle, modStyle);
    const successStyle = { fillStyle: NOTE_COLORS['success'], strokeStyle: NOTE_COLORS['success'] };
    const failureStyle = { fillStyle: NOTE_COLORS['failure'], strokeStyle: NOTE_COLORS['failure'] };
    const noStyle = { fillStyle: 'black', strokeStyle: 'black'};

    // vex
    var renderer;

    // TODO
    // we will need to expand this to get rest of duration equal to passed in success note
    // in the near future
    function getQuarterRest() {
        return new Vex.Flow.GhostNote({clef: "treble", keys: ["b/4"], duration: "qr" });
    }

    function renderStavesEmpty(key) {
        let emptyPlayQueue = {
            floatyNotes: [],
            faultyNotes: [],
            futureNotes: [],
            fluffyNotes: [] // phantom, right-justification for reverse ATM
        };
        renderStaves(emptyPlayQueue, key);
    }


    function renderStaves(notes, key, pos) {

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

        let stave = new VF.Stave(dummyStave.x+dummyStave.width, 40, 650);

        stave.setContext(context).draw();
        stave.setNoteStartX(pos);

        // FIXME note that octave id is not zero based in vexflow (3C vs C/4 for middle c)
        // color the note appropriately (active / modifier hints)
        let futureVexNotes = notes.futureNotes.slice(0, 8).map( n => n.vexNote );
        if(futureVexNotes.length) {
            futureVexNotes.forEach( (vn,vi) => {
                if(vi === 0) vn.setStyle(activeStyle);
                vn.keyProps.forEach( (n,i) => {
                    if(n.signatureKeyHint) {
                        vn.setKeyStyle(i, vi === 0 ? activeModStyle : modStyle);
                    }
                });
            });
        }

        let floatyVexNotes = notes.floatyNotes.map( n => n.vexNote );
        if(floatyVexNotes.length) {
            floatyVexNotes.forEach( (vn, vi) => {
                // TODO consider how chords will be done - likely
                // we will have to loop on note.keys first and
                // set style as aggregate if we want to show red/green
                if(!vn.keyProps.some(k => !!k.noStyle)) {
                    vn.setStyle(successStyle);
                } else vn.setStyle(noStyle);
            });

        }

        // we are adding a rest for each success note still displayed to format correctly
        let faultyVexNotes = notes.faultyNotes.map( n => n.vexNote );
        faultyVexNotes.forEach( (vn, vi) => vn.setStyle(failureStyle) );
        if(faultyVexNotes.length) faultyVexNotes = notes.floatyNotes.map(getQuarterRest).concat(faultyVexNotes);

        let phantomVexNotes = notes.fluffyNotes.map( n => n.vexNote ); // padding
        //phantomVexNotes.forEach((vn) => vn.setStyle(successStyle));

        let futureVoice = new VF.Voice({ num_beats: 4, beat_value: 4 });
        futureVoice.setStrict(false); // remove tick counting, we aren't using measures
        futureVoice.addTickables(floatyVexNotes.concat(futureVexNotes).concat(phantomVexNotes).slice(0, 8)); // slice to keep justify from squeezing

        let faultyVoice = new VF.Voice({ num_beats: 4, beat_value: 4 });
        faultyVoice.setStrict(false); // remove tick counting, we aren't using measures
        faultyVoice.addTickables(faultyVexNotes);

        // we are NOT joining voices, which ONLY handles accidental collision avoidence
        // we do not want notes of different voices (e.g., faulty notes) to appear as intended artifacts, merely visual effects
        //let formatter = new VF.Formatter().format([futureVoice, floatyVoice], 700);
        let formatter = new VF.Formatter().format([futureVoice, faultyVoice], 700);
        futureVoice.draw(context, stave);
        faultyVoice.draw(context, stave);
    }

    return {
        init: function(instrument) { 
                  renderer = new Vex.Flow.Renderer($('#vex-canvas')[0], 
                          Vex.Flow.Renderer.Backends.CANVAS);
                  keyboard = instrument; 
              },
        startNoteX: START_NOTE_X,
        noteColors: NOTE_COLORS,
        renderStavesEmpty: renderStavesEmpty,
        renderStaves: renderStaves
    }


});
