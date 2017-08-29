define(['jquery', './dispatcher', 'underscore', './audio', './util'], function($, dispatcher, _, audio, util) {

    // TODO freeze, and/or consolidate into Audio (from keyboard as well)
    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    const streamOpts = {
        "audio": {
            "mandatory": {
                "googEchoCancellation": "false",
                "googAutoGainControl": "false",
                "googNoiseSuppression": "false",
                "googHighpassFilter": "false"
            },
            "optional": []
        }
    };

    var audioContext = null,
        DEBUGCANVAS = null,
        analyser = null;


    // TODO make animation specific to instance
    // Whistle UI Specific (DELETE MOST OF THIS)
    var detectorElem,
        canvasElem,
        waveCanvas,
        pitchElem,
        noteElem,
        detuneElem,
        detuneAmount;

    // TODO remove most of this, and pass in UI elements as dependencies
    function setupUI() {
        audioContext = new AudioContext();
        MAX_SIZE = Math.max(4,Math.floor(audioContext.sampleRate/5000));    // corresponds to a 5kHz signal

        detectorElem = document.getElementById( "detector" );
        canvasElem = document.getElementById( "output" );
        DEBUGCANVAS = document.getElementById( "waveform" );
        if (DEBUGCANVAS) {
            waveCanvas = DEBUGCANVAS.getContext("2d");
            waveCanvas.strokeStyle = "black";
            waveCanvas.lineWidth = 1;
        }
        pitchElem = document.getElementById( "pitch" );
        noteElem = document.getElementById( "note" );
        detuneElem = document.getElementById( "detune" );
        detuneAmount = document.getElementById( "detune_amt" );
    }


    var rafID = null;
    var buf = new Float32Array(1024);

    function Microphone() {
        this.tone = undefined;
        this.mediaStreamSource = null;
        setupUI(); // FIXME remove
    }

    Microphone.prototype.enable = function() {
        if (!window.cancelAnimationFrame)
            window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );
        audio.getUserMedia(streamOpts, this.onMicAudioSuccess);
    }


    Microphone.prototype.onMicAudioSuccess = function(stream) {
        console.log('got the mic!');
        // Create an AudioNode from the stream.
        this.mediaStreamSource = audioContext.createMediaStreamSource(stream);

        // Connect it to the destination.
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        this.mediaStreamSource.connect( analyser );
        updatePitch();
        dispatcher.trigger('mic::ready');
    }

    function updatePitch() {
        console.log('update called');

        var cycles = new Array;
        analyser.getFloatTimeDomainData( buf );
        var ac = audio.autoCorrelate( buf, audioContext.sampleRate );
        // TODO: Paint confidence meter on canvasElem here.

        /*
        if (DEBUGCANVAS) {  // This draws the current waveform, useful for debugging
            waveCanvas.clearRect(0,0,512,256);
            waveCanvas.strokeStyle = "red";
            waveCanvas.beginPath();
            waveCanvas.moveTo(0,0);
            waveCanvas.lineTo(0,256);
            waveCanvas.moveTo(128,0);
            waveCanvas.lineTo(128,256);
            waveCanvas.moveTo(256,0);
            waveCanvas.lineTo(256,256);
            waveCanvas.moveTo(384,0);
            waveCanvas.lineTo(384,256);
            waveCanvas.moveTo(512,0);
            waveCanvas.lineTo(512,256);
            waveCanvas.stroke();
            waveCanvas.strokeStyle = "black";
            waveCanvas.beginPath();
            waveCanvas.moveTo(0,buf[0]);
            for (var i=1;i<512;i++) {
                waveCanvas.lineTo(i,128+(buf[i]*128));
            }
            waveCanvas.stroke();
        }
        */

        if (ac == -1) {
            detectorElem.className = "vague";
            pitchElem.innerText = "--";
            noteElem.innerText = "-";
            detuneElem.className = "";
            detuneAmount.innerText = "--";
        } else {
            detectorElem.className = "confident";
            pitch = ac;
            pitchElem.innerText = Math.round( pitch ) ;
            var note =  audio.noteFromPitch( pitch );
            noteElem.innerHTML = noteStrings[note%12];
            var detune = audio.centsOffFromPitch( pitch, note );
            if (detune == 0 ) {
                detuneElem.className = "";
                detuneAmount.innerHTML = "--";
            } else {
                if (detune < 0)
                    detuneElem.className = "flat";
                else
                    detuneElem.className = "sharp";
                detuneAmount.innerHTML = Math.abs( detune );
            }
        }

        if (!window.requestAnimationFrame)
            window.requestAnimationFrame = window.webkitRequestAnimationFrame;
        rafID = window.requestAnimationFrame( updatePitch );
    }

    return Microphone;
});
