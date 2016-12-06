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

    var treble = {
        canvas: undefined,
        ctx: undefined,
    };

    var bass = {
        canvas: undefined,
        ctx: undefined,
    };


     // Note: object to be rendered on staff
     // has pointer to relevant key
    function Note(id) {
        let n = keyboard.noteNames;

        this.id = id; 
        this.key = keyboard.keysById[id];
        this.name = this.key.note;
        this.x = START_NOTE_X;
        this.y = NOTES_POS_H[n.indexOf(this.name)]
    }



    // Consider making this draw many notes at once, to avoid unecessary context save/restore
    function drawNote(note, style) {
        let ctx = treble.ctx;

        // lines for special notes
        if(!style || style === 'active') {
            if(note.id === keyboard.MIDDLE_C || note.id === keyboard.MIDDLE_C+'s' ||
                    note.id === '3D' || note.id === '3Ds') {
                ctx.beginPath();
                ctx.moveTo(note.x-10, UNDERBAR);
                ctx.lineTo(note.x+40, UNDERBAR);
                ctx.stroke();
            }
        }

        ctx.font="84px FreeSerif"; // should be available via css font-face!
        if(!!style && (style === 'active' || style === 'success')) {
            ctx.save();
            ctx.strokeStyle="black";
            ctx.fillStyle=NOTE_COLORS[style];
            ctx.lineWidth=5;
            ctx.strokeText("\ud834\udd5d", note.x, note.y);
            ctx.fillText("\ud834\udd5d", note.x, note.y);
            if(note.name.endsWith('s')) {
                ctx.font="30px FreeSerif"; // should be available via css font-face!
                ctx.strokeText("\u266f", note.x-15, note.y); // sharp symbol!
                ctx.fillText("\u266f", note.x-15, note.y); // sharp symbol!
            }
            ctx.restore();
        } else { // normal note
            ctx.save();
            if(!!style) ctx.fillStyle = NOTE_COLORS[style];
            //if(!!style && style === 'success') ctx.fillStyle="#46EC00"; 
            ctx.fillText("\ud834\udd5d", note.x, note.y);
            if(note.name.endsWith('s')) {
                ctx.font="30px FreeSerif"; // should be available via css font-face!
                ctx.strokeText("\u266f", note.x-15, note.y); // sharp symbol!
                ctx.fillText("\u266f", note.x-15, note.y); // sharp symbol!
            }
            ctx.restore();
        }

        ctx.fillStyle = "black";
    }

    function renderClef() {
        renderStaff([], true) // just for background
        // treble-clef
        let ctx = treble.ctx;
        let tc = new Image(); 
        tc.onload = () => ctx.drawImage(tc, 0, 8, 75, 190);
        tc.src = 'img/treble-clef.gif';
    }


    // preRender is a stage where we draw the clef
    function renderStaff(notes, preRender, successes) {

        let ctx = treble.ctx,
            start = preRender ? 0 : 70;

        ctx.clearRect(start, 40, CANVAS_WIDTH, 150);
            ctx.beginPath();

        if(!preRender) {
            ctx.save();
            //ctx.fillStyle = '#FF3357';
            //ctx.globalAlpha = 0.4;
            //ctx.fillRect(80,40,22,150);
            ctx.beginPath();
            ctx.moveTo(100, 50);
            ctx.lineTo(100, 150);
            ctx.stroke();
            ctx.restore();
        }

        for(var x=2; x<=6; x++) {
            let pos = x*TREBLE_BAR_HEIGHT;
            ctx.moveTo(start,pos);
            ctx.lineTo(CANVAS_WIDTH,pos);
        }
        ctx.stroke();
        notes.map((n, i) => { 
            let style = n.status || ( i === 0 ? 'active' : undefined );
            drawNote(n, style);
        });
        if(!!successes) successes.map((n) => drawNote(n, 'success'));
    }


    function renderVex(num) {
        let VF = Vex.Flow;
        //console.log('should render vex score');
        renderer.resize(620, 190);
        let context = renderer.getContext();
        context.setFont("Arial", 10, "").setBackgroundFillStyle("#eed");

        let stave = new VF.Stave(10, 40, 600);
        stave.addClef('treble'); //.addTimeSignature('4/4');

        // key signature test
        keySig = new VF.KeySignature('A');
        keySig.addToStave(stave);

        stave.setContext(context).draw();
        stave.setNoteStartX(num);

        let vexNotes = [
            new VF.StaveNote({ clef: 'treble', keys: ['c/4'], duration: 'h', auto_stem: true }),
            new VF.StaveNote({ clef: 'treble', keys: ['e/4'], duration: 'q', auto_stem: true }),
            new VF.StaveNote({ clef: 'treble', keys: ['g/4'], duration: 'q', auto_stem: true }),
            new VF.StaveNote({ clef: 'treble', keys: ['c/4'], duration: 'w', auto_stem: true })
        ];

        let voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
        voice.setStrict(false); // remove tick counting, we aren't using measures
        voice.addTickables(vexNotes);
        let formatter = new VF.Formatter().joinVoices([voice]).format([voice], 400); // justify to 400 pixels
        voice.draw(context, stave);
    }

    return {
        init: function(instrument) { 
                  renderer = new Vex.Flow.Renderer($('#vex-canvas')[0], 
                          Vex.Flow.Renderer.Backends.CANVAS);
                  treble.canvas = $('#treble-staff')[0];
                  treble.ctx = treble.canvas.getContext('2d');
                  keyboard = instrument; 
              },
        Note: Note,
        renderClef: renderClef,
        renderStaff: renderStaff,
        renderVex: renderVex
    }


});
