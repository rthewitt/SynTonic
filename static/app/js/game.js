// FIXME pressing a button rapidly can give two points
define(['jquery', 'underscore', 'rxjs', './dispatcher', './util'], function($, _, Rx, dispatcher, util) {

    const MAX_NOTE_X = 150;
    const TREBLE_BAR_HEIGHT = 25;
    //  from keyboard:  ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
    const NOTES_POS_H = [175, 175, 163, 163, 150, 138, 138, 125, 125, 113, 113, 100];
    const STREAM_SPEED = -5;


    var gameStop, 
        keyboard,
        gameSelect, 
        showSettings,
        scoreBoard, 
        progressBar;


    /*
     * UI Related functions
     */

    function updateProgressBar(cur, max) {
        let p = Math.round(100 * (cur / max));
        progressBar.css('width', ''+p+'%');
        if(p < 10) {
            progressBar.removeClass('progress-bar-info progress-bar-success progress-bar-warning');
            progressBar.addClass('progress-bar-danger active');
        } else if(p < 20) {
            progressBar.removeClass('progress-bar-info progress-bar-success progress-bar-danger active');
            progressBar.addClass('progress-bar-warning');
        } else {
            progressBar.removeClass('progress-bar-info progress-bar-danger progress-bar-warning active');
            progressBar.addClass('progress-bar-success');
        }
    }

    function colorKey(key, clazz, duration) {
        $('#'+key.id).addClass(clazz);
        if(!!duration) setTimeout(function() {
            $('#'+key.id).removeClass(clazz);
        }, duration);
    }

    function clearKey(key) {
        $('#'+key.id).removeClass('waiting success failure pressed'); // clearing pressed may be a mistake
    }

    function clearAllKeys() {
        _.each(keyboard.keys, clearKey);
    }

    function successKey(key) {
        colorKey(key, 'success', 200);
    };

    function failKey(key) {
        colorKey(key, 'failure', 200);
    };

    function activateKey(key) {
        colorKey(key, 'waiting'); 
    }


    /*
     * Sheet music related objects and
     * functions
     */

    var treble = {
        canvas: undefined,
        ctx: undefined,
    };

    var bass = {
        canvas: undefined,
        ctx: undefined,
    };

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



    /*
     * Game specific functions
     */

    // started out as hit/miss, then changed to score calculation
    function evaluateSimple(attempt) {
        let success = attempt.target.id === attempt.pressed.id;
        let delta = success ?  this.reward : this.penalty;
        console.log('delta '+delta);
        return Object.assign({}, attempt, 
                { success: success, modifier: delta });
    }


    function flowGenerate() {
        let first = keyboard.keysById['3C'],
            last = keyboard.keysById['3B'],
            min = keyboard.keys.indexOf(first),
            max = keyboard.keys.indexOf(last),
            n;
        do {
            n = Math.floor( Math.random() * ((max+1)-min) ) + min; // those parens are necessary!
        } while(keyboard.blacklist.indexOf(n + min) !== -1); // blacklist currently in MIDI
        return new Note(keyboard.keys[n].id);
    }


    function updateUIForAttempt(attempt) {
        feedback = attempt.success ? successKey : failKey;
        feedback(attempt.pressed);
    }


    function Game(opts) {

        // Flow variation
        this.reward = 1;
        this.penalty = 0;

        let gameTime = 20;




        var self = this;
        let playerPresses = opts.playerPresses,
            playerReleases = opts.playerReleases;


        // "generator" for notes
        var notegen = new Rx.Subject();

        // state variable
        var playQueue = [];

        // IMPORTANT playQueue dequeues must only occur downstream to preserve accuracy
        let attempts = playerPresses.map((x) => ({ target: playQueue[0], pressed: x })).map(evaluateSimple, self);

        // various ways the game will end - apply with array did not work...
        // placed visual cue (green/red) here to ensure it still happens on failure, but not beyond
        let ender = Rx.Observable.merge(
            Rx.Observable.fromEvent(gameStop, 'click').take(1).do(() => console.log('GAME MANUALLY STOPPED')),
            Rx.Observable.interval(1E3 * gameTime).take(1).do(() => console.log('GAME TIMED OUT...')),
            attempts.do(updateUIForAttempt).filter((a) => !a.success) // player missed!
            ).publish().refCount(); // make it hot


        // update scoreBoard
        attempts.pluck('modifier').takeUntil(ender).scan((score, delta) => score+delta > 0 ? score+delta : 0 , 0).subscribe((score) => {
            scoreBoard.text(''+score);
            self.score = score;
        }) 

        // update progress
        Rx.Observable.timer(0, 500).takeUntil(ender).subscribe((elapsed) => {
            let max = 2 * gameTime,
                left = max - (elapsed+1); // +1 to end animation at zero
            updateProgressBar(left > 0 ? left : left, max);
        });


        let noteStream = Rx.Observable.interval(16).takeUntil(ender).scan((v, tick) => { 
            let tempo = playQueue[0].x <= 100 ? 0 : v || STREAM_SPEED;
            playQueue.map((note) => {
                note.x = note.x + tempo;
            });
            return tempo;
        }, STREAM_SPEED).subscribe(() => renderStaff(playQueue));


        // TODO move this into settings somewhere
        // do we want to play "out of octave sound"?
        let audibleMiss = true;
        playerReleases.subscribe((key) => dispatcher.trigger('key::release', key));
        if(audibleMiss) {
            attempts.subscribe((attempt) => {
                key = attempt.success ? attempt.pressed : keyboard.keysById['0C'];
                dispatcher.trigger('key::press', key);
                dispatcher.trigger('key::release', key);
            });
        } else playerPresses.subscribe((key) => dispatcher.trigger('key::press', key));


        // player needs a new key to play!
        // instead of advancing the sheet music, we think of the sheet music as an ever advancing stream that stops only when it must
        let moveForward = attempts.takeUntil(ender).filter((attempt) => attempt.success).delay(100).do(clearAllKeys).subscribe((attempt) => {
            playQueue.shift();
            if(playQueue.length < 12) 
                notegen.onNext(flowGenerate())
            // advance the keyboard UI
            activateKey(playQueue[0].key); 
        },
        (err) => console.log(err),
        // on complete (game ended)
        () => {
            console.log('ENDING GAME');
            clearAllKeys();
            renderStaff([]);
            updateProgressBar(0,1);
            let best = parseInt(localStorage['best']) || 0;
            let currentScore = parseInt(self.score) || 0;
            msg = 'Score: ' + currentScore;
            if( currentScore > best ) {
                localStorage['best'] = currentScore;
                msg += ' - BEST YET! :-D'
            }
            alert(msg);
        });


        let gamePlay = notegen.takeUntil(ender).subscribe((note) => { 
            // if there are notes already, we want to offset them
            if(playQueue.length > 0) 
                note.x = playQueue[playQueue.length-1].x + 80; // place at end of staff
            playQueue.push(note); // always push!
        });

        let startNote = new Note(keyboard.MIDDLE_C);
        notegen.onNext(startNote);
        activateKey(startNote.key); 
        for(let z=0; z<11; z++) {
            notegen.onNext(flowGenerate());
        }
        gameStop.show(); 
        scoreBoard.text('0');
    }

    Game.prototype.evaluate = evaluateSimple;

    // avoid memory leaks!
    Game.prototype.cleanup = function() {
    }


    Game.prototype.start = function() {
    }

    // when the app / dom is ready...
    function initialize(instrument) {
        treble.canvas = $('#treble-staff')[0];
        treble.ctx = treble.canvas.getContext('2d');
        gameStop = $('#stop-game');
        progressBar = $('#progress-meter');
        scoreBoard = $('#scoreboard');

        // TODO see main.js for TODO
        // remove UI functions from this file
        keyboard = instrument;

        updateProgressBar(1,1);
        renderCleff();
    }

    return {
        Flow: Game,
        init: initialize
    }

});
