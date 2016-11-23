// FIXME pressing a button rapidly can give two points
// TODO ensure that evaluate / evaluateSimple is only running once, it logs multiple times...
define(['jquery', 'rxjs', './sheet', './dispatcher', './util'], function($, Rx, MusicSheet, dispatcher, util) {

    const STREAM_SPEED = -5;

    var gameStop, 
        keyboard,
        scoreBoard, 
        progressBar;

    var Note = MusicSheet.Note;

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
        let success = attempt.target.id === attempt.pressed.id;
        let delta = success ?  this.reward : this.penalty;
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
        if(attempt.success) keyboard.successKey(attempt.pressed);
        else keyboard.failKey(attempt.pressed);
    }


    function Game(opts) {
        initialize(opts.keyboard);

        // Flow variation
        this.reward = 1;
        this.penalty = 0;

        let gameTime = 20;

        let playerPresses = opts.playerPresses,
            playerReleases = opts.playerReleases;

        // more concise code
        let kb = keyboard;
            clearAllKeys = kb.clearAllKeys.bind(kb);
            activateKey = kb.activateKey.bind(kb);
            evaluate = this.evaluate.bind(this);

        var self = this;

        // "generator" for notes
        var notegen = new Rx.Subject();

        // state variable
        var playQueue = [];

        // IMPORTANT playQueue dequeues must only occur downstream to preserve accuracy
        let attempts = playerPresses.map((x) => ({ target: playQueue[0], pressed: x })).map(evaluate);
        let relay = Rx.Observable.merge( attempts.take(1), Rx.Observable.fromEvent(dispatcher, 'game::relay'));

        // create and switch to new timer every time user reaches relay point!!
        // secret here is that it will only emit once, but do side effect on every internal tick
        var maxTicks = 2*gameTime; // only valid for 500ms!
        var gameTimer = relay.map( 
            () => Rx.Observable.timer(0, 500).take(maxTicks).do((elapsed) => 
                    updateProgressBar(maxTicks-(elapsed+1), maxTicks)).skip(maxTicks-1)
        ).switch().take(1).publish().refCount();


        // TODO understand if moving the do(updateUIForAttempt) to attempts above will still work...
        // various ways the game will end - apply with array did not work...
        // placed visual cue (green/red) here to ensure it still happens on failure, but not beyond
        let ender = Rx.Observable.merge(
            Rx.Observable.fromEvent(gameStop, 'click').take(1).do(() => console.log('GAME MANUALLY STOPPED')),
            Rx.Observable.fromEvent(dispatcher, 'game::cleanup').take(1).do(() => console.log('Cleaning up...')),
            gameTimer.do(() => console.log('GAME TIMED OUT...')),
            attempts.do(updateUIForAttempt).filter((a) => !a.success) // player missed!
            ).publish().refCount(); // make it hot


        // update scoreBoard
        attempts.pluck('modifier').takeUntil(ender).scan((score, delta) => score+delta > 0 ? score+delta : 0 , 0).subscribe((score) => {
            scoreBoard.text(''+score);
            self.score = score;
        });


        let noteStream = Rx.Observable.interval(16).takeUntil(ender).scan((v, tick) => { 
            let tempo = playQueue[0].x <= 100 ? 0 : v || STREAM_SPEED;
            playQueue.map((note) => {
                note.x = note.x + tempo;
            });
            return tempo;
        }, STREAM_SPEED).subscribe(() => MusicSheet.renderStaff(playQueue));


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
            if(n % 30 === 0) dispatcher.trigger('game::relay');
        });

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
            MusicSheet.renderStaff([]);
            setNoProgress();
            dispatcher.trigger('game::over');
        });


        let gamePlay = notegen.takeUntil(ender).subscribe((note) => { 
            // if there are notes already, we want to offset them
            if(playQueue.length > 0) 
                note.x = playQueue[playQueue.length-1].x + 80; // place at end of staff
            playQueue.push(note); // always push!
        });

        let startNote = new Note(kb.MIDDLE_C);
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
        MusicSheet.renderCleff();
    }

    return {
        Flow: Game
    }

});
