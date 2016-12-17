// TODO add ghostnotes after, or invisible rests to the end of floatyNotes during reverse scale
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
        this.vexNote = new VF.StaveNote({ clef: 'treble', keys: [noteName.replace('s', '#')+'/'+(octave+1)], duration: 'q', auto_stem: true });

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


    // TODO get this once, not every single time
    // benefit is that I could cycle scales as I go
    function generateScales() {
        let scale = util.getScaleForKey(this.key);
        return Rx.Observable.fromArray(scale) 
            .map( n_o  => new Note(n_o[0], n_o[1], self.key));
        /*
        let scaleSelacs = util.mirrorScale(scale);
        let self = this;
        return Rx.Observable.fromArray(scaleSelacs) 
            .map( n_o  => new Note(n_o[0], n_o[1], self.key));
            */
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

        return Rx.Observable.just(new Note(noteName, 3, this.key));
    }

    function updateUIForAttempt(attempt) {
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

        this.reward = 1;
        this.penalty = 0;

        let gameTime = 20;

        let playerPresses = opts.playerPresses,
            playerReleases = opts.playerReleases;


        switch(this.type) {
            case gt.FLOW:
                this.streamSpeed = -10;
                this.generate = generateSimple;
                break;
            case gt.STAMINA:
                this.streamSpeed = -7;
                this.generate = generateSimple;
                break;
            case gt.SCALES:
                this.streamSpeed = 0;
                this.generate = generateScales;
                break;
        }


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

        // TODO create simple function API so that we don't require
        // domain knowledge elsewhere in the code to take advantage of this
        let sourceNotes = notegen.flatMap( (thrust) => {
            if(!thrust) return generate();
            if(thrust instanceof Note) return Rx.Observable.just(thrust);
            let requested = [], n=thrust;
            if(typeof thrust === 'number') {
                for(let i=0; i<n; i++) requested.push(generate());
                return requested[0].merge.apply(requested.slice(1));
            }
            throw Exception('Cannot generate from thrusted value='+thrust+'of type '+(typeof thrust));
        });

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
        let attempts = playerPresses.map((x) => ({ target: futureNotes[0].key, pressed: x })).map(evaluate).publish().refCount();
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
        this.update$ = attempts.do(updateUIForAttempt).subscribe();

        let badAttempts = attempts.filter((a) => !a.success).pluck('pressed').map(badNote);

        // various ways the game will end - apply with array did not work...
        // placed visual cue (green/red) here to ensure it still happens on failure, but not beyond
        let ender = Rx.Observable.merge(
            Rx.Observable.fromEvent(gameStop, 'click').take(1).do(() => console.log('GAME MANUALLY STOPPED')),
            Rx.Observable.fromEvent(dispatcher, 'game::cleanup').take(1).do(() => console.log('Cleaning up...')),
            gameTimer.do(() => console.log('GAME TIMED OUT...')),
            badAttempts.do(() => console.log('BAD ATTEMPT...')),
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


        function advanceStream(pos, tick) {
            let tempo = self.streamSpeed;

            if(floatyNotes.length && X(floatyNotes[0]) < (MusicSheet.startNoteX-75)) {
                floatyNotes.shift();
                return calcStreamDelta(tempo);
            }


            // setting streamSpeed looked cool, but state change and unecessary
            // distraction from actually playing the scales.
            // TODO FIXME verify that this should be removed,
            // now that I'm relying on reverse movement of note activation in advanceForever
            /*
            if(self.type === gt.SCALES && floatyNotes.length === 8) {
                for(let c=0; c<8; c++) floatyNotes.shift();
            }
            */

            if(futureNotes[0] && futureNotes[0].status === 'success') {
                floatyNotes.push( futureNotes.shift() ); 
                return calcStreamDelta(tempo);
            }

            // WILL THIS WORK WITH SUCCESS?
            let cutoff = self.type === gt.STAMINA ? MusicSheet.startNoteX - Width(firstNote()) : MusicSheet.startNoteX + 10; // 10px buffer for aesthetics

            let fx;
            try { fx = X(futureNotes[0]); } catch(_) { fx = Infinity; }
            if(fx <= cutoff) {
                console.log('ZERO?');
                if(self.type === gt.STAMINA) dispatcher.trigger('key::miss');
                tempo = 0;
            } 

            return pos + tempo;
        }


        // This is the graphical progress of the sheet music
        // Think of the sheet music as an ever advancing stream that stops only when it must
        let noteStream = Rx.Observable.interval(34).skipUntil(attempts).takeUntil(ender)
            .scan(advanceStream, MusicSheet.startNoteX)
            .subscribe( 
                p => MusicSheet.renderStaves(playQueue, self.key, p),
                err => console.log('ERROR IN STREAM\n'+err),
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
            // TODO evaluate this decision to have three different points for change
            // relay could be in advanceForever, and this success property literally just
            // passes the buck to advanceStram (for graphics).
            // there is a false dichotomy right now regarding array pop/shift for graphics
            // and for gameplay.  advanceStream should only be for rendering if possible
            // FIXME hack because scales uses the above justification to do logic in advanceForever
            if(self.type !== gt.SCALES) futureNotes[0].status = 'success';
            //futureNotes[0].status = 'success';
            if(n % 30 === 0) dispatcher.trigger('game::relay');
        });


        function advanceForever() {
            let tooFewNotes;

            if(self.type === gt.SCALES) {

                if(futureNotes.length) {
                    if(futureNotes.length > 1) floatyNotes.push(futureNotes.shift()) // normal operation
                    else if(futureNotes.length === 1) {
                        if(floatyNotes.length == 7) futureNotes.pop(); // do not play capNote twice
                        // this happens even if we popped the capNote!!
                        futureNotes.pop(); // discard played note (maybe animate in the future)
                        if(floatyNotes.length) futureNotes.unshift(floatyNotes.pop()) // activate in reverse
                        else notegen.onNext(); // we are out of notes to play, get another scale
                    }
                }

            } else if(futureNotes.length <= 11) notegen.onNext();
                //notegen.onNext(generate())
            // advance the keyboard UI
            activateKey(futureNotes[0].key); 
        }

        // player needs a new key to play!
        let moveForward = attempts.takeUntil(ender).filter((attempt) => attempt.success)
            .delay(100).do(clearAllKeys).subscribe( advanceForever, (err) => console.log(err),
                // on complete (game ended)
                () => {
                    console.log('ENDING GAME');
                    setNoProgress();
                    dispatcher.trigger('game::over');
                });


        let gamePlay = sourceNotes.takeUntil(ender).subscribe( n => futureNotes.push(n) );

        let tonic = util.getScaleForKey(this.key)[0],
            startNote = new Note(tonic[0], tonic[1], this.key);

        notegen.onNext(this.type === gt.SCALES ? undefined : startNote);
        activateKey(startNote.key);
        if(this.type !== gt.SCALES) notegen.onNext(11);

        MusicSheet.renderStaves(playQueue, this.key);
        scoreBoard.text('0');
    }

    Game.prototype.evaluate = evaluateSimple;

    // avoid memory leaks!
    Game.prototype.cleanup = function() { 
        console.log('cleaning up');
        dispatcher.trigger('game::cleanup');
        this.presses$.dispose();
        this.releases$.dispose();
        this.update$.dispose();
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
