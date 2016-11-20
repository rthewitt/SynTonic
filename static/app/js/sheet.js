define(['jquery', 'rxjs', './dispatcher', './util'], function($, Rx, dispatcher, util) {

    const MAX_NOTE_X = 150;
    const TREBLE_BAR_HEIGHT = 25;
    //  from keyboard:  ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
    const NOTES_POS_H = [175, 175, 163, 163, 150, 138, 138, 125, 125, 113, 113, 100];

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
        this.x = MAX_NOTE_X;
        this.y = NOTES_POS_H[n.indexOf(this.name)]
    }



    // TODO
    //var sharp = new Image();
    //sharp.src = 'img/sharp.gif';

    function drawNote(note) {
        let ctx = treble.ctx;

        // lines for special notes
        if(note.id === keyboard.MIDDLE_C || note.id === keyboard.MIDDLE_C+'s' ) {
            ctx.beginPath();
            ctx.moveTo(note.x-15, note.y);
            ctx.lineTo(note.x+15, note.y);
            ctx.stroke();
        } else if(note.id === '3D' || note.id === '3Ds') {
            ctx.beginPath();
            ctx.moveTo(note.x-15, note.y+12);
            ctx.lineTo(note.x+15, note.y+12);
            ctx.stroke();
        }

        // draw note
        ctx.beginPath();
        if(note.name.endsWith('s')) {
            ctx.fillStyle = 'red';
        }
        ctx.arc(note.x, note.y, 10, 0, 2*Math.PI);
        ctx.fill();
        ctx.fillStyle = 'black';
    }

    function renderCleff() {
        renderStaff([], true) // just for background
        // treble-cleff
        let ctx = treble.ctx;
        let tc = new Image(); 
        tc.onload = () => ctx.drawImage(tc, 0, 8, 75, 190);
        tc.src = 'img/treble-cleff.gif';
    }

    function renderStaff(notes, preRender) {

        let ctx = treble.ctx,
            start = preRender ? 0 : 70;

        ctx.clearRect(70, 40, 600, 150);
            ctx.beginPath();
        for(var x=2; x<=6; x++) {
            let pos = x*TREBLE_BAR_HEIGHT;
            ctx.moveTo(start,pos);
            ctx.lineTo(600,pos);
        }
        ctx.stroke();
        notes.map(drawNote);
    }


    return {
        init: function(instrument) { 
                  treble.canvas = $('#treble-staff')[0];
                  treble.ctx = treble.canvas.getContext('2d');
                  keyboard = instrument; 
              },
        Note: Note,
        renderCleff: renderCleff,
        renderStaff: renderStaff
    }

});
