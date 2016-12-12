// FIXME pressing a button rapidly can give two points
define(['jquery', 'rxjs', 'vexflow', './sheet', './dispatcher', './util'], function($, Rx, Vex, MusicSheet, dispatcher, util) {

    const MODIFIED_NOTES = {
        '#': ['F', 'C', 'G', 'D', 'A', 'E', 'B'],
        'b': ['B', 'E', 'A', 'D', 'G', 'C', 'F']
    };

    var gameStop, 
        gameStart,
        keyboard,
        scoreBoard, 
        progressBar;


    // stub so that our API is not confusing (vexNotes vs Note Notes)
    // will go away if and when we use "inheritance" - still hesitant on that
    function badNote(pianoKey) {
        return {
            status: 'failure',
            vexNote: util.getVexNoteForPianoKey(pianoKey),
            key: null
        }
    }

     // Note: object to be rendered on staff
     // has pointer to relevant key
     // octave is coerced to string so can be int/string. This allows 00 to match current HTML
    function Note(noteName, octave, keysig) {
        let VF = Vex.Flow;
        this.status = null;
        this.vexNote = new VF.StaveNote({ clef: 'treble', keys: [noteName.replace('s', '#')+'/4'], duration: 'q', auto_stem: true });

        let keySpec = !!keysig ? VF.keySignature.keySpecs[keysig] : null;

        let pKeyId = ''+octave+noteName;

        var self = this;
        this.vexNote.keys.forEach( (n,i) => {
            isModified = false;

            // actualy display the accidental if one is present
            let acc = self.vexNote.keyProps[i].accidental;
            if(!!acc) self.vexNote.addAccidental(i, new VF.Accidental(acc));

            // if there's a better (vexflow) way to do this, I don't know of it
            // we don't want to set render properities outside of render functions
            // so setting and forgetting the style is inappropriate
            if(!!keySpec && !!keySpec.acc) {
                let modifiedNotes = MODIFIED_NOTES[keySpec.acc].slice(0, keySpec.num);
                if(modifiedNotes.indexOf(noteName) !== -1) {
                    pKeyId = '' + octave + noteName + (keySpec.acc === '#' ? 's' : 'b');
                    isModified = true;
                }
            }
            self.vexNote.keyProps[i].signatureKeyHint = isModified;
        });
        this.key = keyboard.keysById[pKeyId];
    }


    var setNoProgress = () => updateProgressBar(0, 1);
    var setMaxProgress = () => updateProgressBar(1, 1);

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


    // started out as hit/miss, then changed to score calculation
    function evaluateSimple(attempt) {
        let success = attempt.target === attempt.pressed;
        let delta = success ?  this.reward : this.penalty;
        return Object.assign({}, attempt, 
                { success: success, modifier: delta }); // score modifier
    }


    function generateSimple() {
        // TODO figure out note range for treble clef.  Always the same? Start from MIDDLE_C or key tonic?
        // TODO add accidentals via randomness in order to make this the [only/base] case, NEVER if keysig by default
        // could just be a global setting [ restrict sharp/flat while playing in key ]
        // also don't forget: consider mode where we IMITATE a key by only using those accidentals. - what mechanic though?
        let min = 0,
            max = keyboard.noteNames.length-1, // should be 6 (7 notes)
            n = Math.floor( Math.random() * ((max+1)-min) ) + min; // those parens are necessary!
            noteName = keyboard.noteNames[n];

        // All notes are fair game if no keysig
        if(!this.key && Math.random() < 0.5) {
            noteName += Math.random() < 0.5 ? 's' : 'b';
        }

        return new Note(noteName, 3, this.key);
    }

    function updateUIForAttempt(attempt) {
        console.log('HERE IT IS');
        if(attempt.success) {
            keyboard.successKey(attempt.pressed);
        } else keyboard.failKeyForever(attempt.pressed);
    }


    function Game(opts) {
        initialize(opts.keyboard);
        let gt = util.gameTypes; 

        this.type = opts.type;
        // TODO change this and all occurences to keysig to avoid ambiguity with Note.key / pianoKey
        this.key = opts.key;
        console.log('game is type '+gt.names[this.type]);

        this.streamSpeed = this.type === gt.FLOW ? -10 : -7;

        this.reward = 1;
        this.penalty = 0;

        let gameTime = 20;

        let playerPresses = opts.playerPresses,
            playerReleases = opts.playerReleases;

        // more concise code
        let kb = keyboard;
            clearAllKeys = kb.clearAllKeys.bind(kb),
            activateKey = kb.activateKey.bind(kb),
            generate = this.generate.bind(this),
            evaluate = this.evaluate.bind(this);

        clearAllKeys();

        var self = this;

        // "generator" for notes
        var notegen = new Rx.Subject();

        // state variables (actually several queues)
        var playQueue = window.playQueue = { faultyNotes: [], floatyNotes: [], futureNotes: [] };

        // conveniences
        let faultyNotes = playQueue.faultyNotes,
            floatyNotes = playQueue.floatyNotes,
            futureNotes = playQueue.futureNotes;
        

        let firstNote = () => floatyNotes.length ? floatyNotes[0] : futureNotes[0];

        let X = n => n.vexNote.getAbsoluteX(),
            Width = n => n.vexNote.width,
            Padding = n => n.vexNote.left_modPx; // accidentals, etc
            WidthAndPadding = n => Width(n) + Padding(n);

        // IMPORTANT playQueue dequeues must only occur downstream to preserve accuracy
        let attempts = playerPresses.map((x) => ({ target: futureNotes[0].key, pressed: x })).map(evaluate);
        let relay = Rx.Observable.merge( attempts.take(1), Rx.Observable.fromEvent(dispatcher, 'game::relay'));

        // create and switch to new timer every time user reaches relay point!!
        // secret here is that it will only emit once, but do side effect on every internal tick
        let maxTicks = 2*gameTime; // only valid for 500ms!
        let gameTimer;

        if(this.type !== gt.STAMINA) { // negation for code form
            gameTimer = relay.map( 
                () => Rx.Observable.timer(0, 500).take(maxTicks).do((elapsed) => 
                        updateProgressBar(maxTicks-(elapsed+1), maxTicks)).skip(maxTicks-1)
            ).switch().take(1).publish().refCount();
        } else gameTimer = Rx.Observable.never(); // STAMINA game, no timer


        // Update UI!
        attempts.do(updateUIForAttempt).subscribe();

        let badAttempts = attempts.filter((a) => !a.success).pluck('pressed').map(badNote);

        // various ways the game will end - apply with array did not work...
        // placed visual cue (green/red) here to ensure it still happens on failure, but not beyond
        let ender = Rx.Observable.merge(
            Rx.Observable.fromEvent(gameStop, 'click').take(1).do(() => console.log('GAME MANUALLY STOPPED')),
            Rx.Observable.fromEvent(dispatcher, 'game::cleanup').take(1).do(() => console.log('Cleaning up...')),
            gameTimer.do(() => console.log('GAME TIMED OUT...')),
            badAttempts,
            Rx.Observable.fromEvent(dispatcher, 'key::miss').take(1).do(() => console.log('Missed!')) // player missed!
            ).publish().refCount(); // make it hot

        badAttempts.takeUntil(ender).subscribe((mishap) => faultyNotes.push(mishap));


        // update scoreBoard
        attempts.pluck('modifier').takeUntil(ender).scan((score, delta) => score+delta > 0 ? score+delta : 0 , 0).subscribe((score) => {
            scoreBoard.text(''+score);
            self.score = score;
        });


        function calcStreamDelta(delta) {
            let first = firstNote();
            // take into account accidentals if there is one (padding)
            return X(first) + delta - WidthAndPadding(first);
        }

        let noteStream = Rx.Observable.interval(34).skipUntil(attempts).takeUntil(ender).scan((pos, tick) => { 
            let tempo = self.streamSpeed;

            if(floatyNotes.length && X(floatyNotes[0]) < (MusicSheet.startNoteX-75)) {
                floatyNotes.shift();
                return calcStreamDelta(tempo);
            }

            if(futureNotes[0].status === 'success') {
                floatyNotes.push( futureNotes.shift() ); 
                return calcStreamDelta(tempo);
            }

            // WILL THIS WORK WITH SUCCESS?
            let cutoff = this.type === gt.STAMINA ? MusicSheet.startNoteX - Width(firstNote()) : MusicSheet.startNoteX + 10; // 10px buffer for aesthetics
            if(X(futureNotes[0]) <= cutoff) {
                if(this.type === gt.STAMINA) dispatcher.trigger('key::miss');
                tempo = 0;
            } 
            return pos + tempo;
        }, MusicSheet.startNoteX).subscribe( 
            p => MusicSheet.renderStaves(playQueue, self.key, p),
            err => {},
            p => MusicSheet.renderStaves(playQueue, self.key, calcStreamDelta(0))
            );


        // TODO move this into settings somewhere
        let audibleMiss = true;
        var pp$, pr$; // subscriptions
        pr$ = playerReleases.takeUntil(ender).subscribe((key) => dispatcher.trigger('key::release', key));
        if(audibleMiss) {
            pp$ = attempts.subscribe((attempt) => {
                key = attempt.success ? attempt.pressed : kb.keysById['0C'];
                dispatcher.trigger('key::press', key);
                dispatcher.trigger('key::release', key);
            });
        } else pp$ = playerPresses.subscribe((key) => dispatcher.trigger('key::press', key));

        // we want to unsubscribe from these
        // if we take until ender, there's no warning sound
        this.presses$ = pp$;
        this.releases$ = pr$;

        // trigger a relay attempt if we make it to 30!
        attempts.takeUntil(ender).filter((attempt) => attempt.success).map((_, n) => n+1).subscribe((n) => {
            futureNotes[0].status = 'success';
            if(n % 30 === 0) dispatcher.trigger('game::relay');
        });

        // player needs a new key to play!
        // instead of advancing the sheet music, we think of the sheet music as an ever advancing stream that stops only when it must
        let moveForward = attempts.takeUntil(ender).filter((attempt) => attempt.success).delay(100).do(clearAllKeys).subscribe((attempt) => {
            if(futureNotes.length < 12) 
                notegen.onNext(generate())
            // advance the keyboard UI
            try {
            activateKey(futureNotes[0].key); 
            } catch(e) {
                debugger;
            }
        },
        (err) => console.log(err),
        // on complete (game ended)
        () => {
            console.log('ENDING GAME');
            setNoProgress();
            dispatcher.trigger('game::over');
        });


        let gamePlay = notegen.takeUntil(ender).subscribe( n => futureNotes.push(n) );

        // TODO change MIDDLE_C to be the tonic of the particular key we are in.
        let startNote = new Note('C', 3, this.key);
        notegen.onNext(startNote);
        activateKey(startNote.key); 
        for(let z=0; z<11; z++) {
            notegen.onNext(this.generate());
        }
        MusicSheet.renderStaves(playQueue, this.key);
        scoreBoard.text('0');
    }

    Game.prototype.evaluate = evaluateSimple;
    Game.prototype.generate = generateSimple;

    // avoid memory leaks!
    Game.prototype.cleanup = function() { 
        console.log('cleaning up');
        dispatcher.trigger('game::cleanup');
        this.presses$.dispose();
        this.releases$.dispose();
    }

    // when the app / dom is ready...
    function initialize(instrument) {
        gameStop = $('#stop-game');
        progressBar = $('#progress-meter');
        scoreBoard = $('#scoreboard');

        // TODO see main.js for TODO
        // remove UI functions from this file
        keyboard = instrument;

        setMaxProgress();
    }

    return {
        Game: Game
    }

});
