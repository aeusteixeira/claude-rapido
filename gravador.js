// Grava o microfone em webm/opus e devolve o áudio pra transcrição. Usado pela barra
// (botão do microfone) e pela janela de ditado (Meta+H).
class Gravador {
  get gravando() {
    return !!this.rec;
  }

  // onNivel recebe o volume (0 a ~0.5) a cada quadro, pra desenhar a onda
  async iniciar(onNivel) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.partes = [];
    this.rec = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' });
    this.rec.ondataavailable = (e) => e.data.size && this.partes.push(e.data);
    this.rec.start();
    if (!onNivel) return;
    this.ctx = new AudioContext();
    const analisador = this.ctx.createAnalyser();
    analisador.fftSize = 512;
    this.ctx.createMediaStreamSource(this.stream).connect(analisador);
    const buf = new Uint8Array(analisador.fftSize);
    const loop = () => {
      if (!this.rec) return;
      analisador.getByteTimeDomainData(buf);
      let soma = 0;
      for (const v of buf) soma += ((v - 128) / 128) ** 2;
      onNivel(Math.sqrt(soma / buf.length));
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  // para e devolve o áudio gravado (ArrayBuffer)
  parar() {
    const rec = this.rec;
    if (!rec) return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = async () => resolve(await new Blob(this.partes, { type: 'audio/webm' }).arrayBuffer());
      this.encerrar();
    });
  }

  cancelar() {
    if (this.rec) this.rec.onstop = null;
    this.encerrar();
  }

  encerrar() {
    cancelAnimationFrame(this.raf);
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    this.rec = null;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close();
    this.stream = this.ctx = null;
  }
}
