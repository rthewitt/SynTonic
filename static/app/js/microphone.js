define(['jquery', './dispatcher', 'underscore', './audio', './util'], function($, dispatcher, _, audio, util) {

    // TODO figure out how to publish / subscribe to microphone stream

    // TODO freeze, and/or consolidate into Audio (from keyboard as well)

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
    var waveCanvas;

    // TODO remove most of this, and pass in UI elements as dependencies
    function setupUI() {
        audioContext = new AudioContext();
        MAX_SIZE = Math.max(4,Math.floor(audioContext.sampleRate/5000));    // corresponds to a 5kHz signal

        DEBUGCANVAS = document.getElementById( "waveform" );
        if (DEBUGCANVAS) {
            waveCanvas = DEBUGCANVAS.getContext("2d");
            waveCanvas.strokeStyle = "black";
            waveCanvas.lineWidth = 1;
        }
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
        //console.log('update called');

        var cycles = new Array;
        analyser.getFloatTimeDomainData( buf );
        var pitch = audio.autoCorrelate( buf, audioContext.sampleRate );
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

        // confident threshold met
        if(pitch != -1) {
            var note =  audio.noteFromPitch( pitch ); // FIXME put this in util, use noteNames (from C instead of my version from A)
            //noteElem.innerHTML = noteStrings[note%12];
            var detune = audio.centsOffFromPitch( pitch, note ); // TODO consider using detune to shift note up/down?
            // less than 0? flat. greater than 0? sharp
            if(note < 108) { // we appear to be getting false readings in silence
                dispatcher.trigger('mic::note', 
                    {
                        pitch: pitch,
                        note: note,
                        detune: detune
                    });
            }
        }

        if (!window.requestAnimationFrame)
            window.requestAnimationFrame = window.webkitRequestAnimationFrame;
        rafID = window.requestAnimationFrame( updatePitch );
    }

    return new Microphone; // important, this is a singleton / instance
});
