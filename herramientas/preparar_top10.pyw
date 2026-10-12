"""
DJ Music Perú - Preparar Top 10
--------------------------------
Programa con ventana: eliges tus canciones originales y te entrega
cada una con la marca de voz, los desvanecimientos cada 10 s y
cifrada, lista para subir a la página. También genera tracks.json.

Requisitos (una sola vez):
  1. Python 3 (python.org, marcar "Add Python to PATH" al instalar)
  2. ffmpeg (winget install ffmpeg   o   https://www.gyan.dev/ffmpeg/builds/)
  3. En una terminal:  pip install cryptography

Se abre con doble clic (extensión .pyw, no muestra la ventana negra).
"""
import base64, json, os, re, shutil, subprocess, sys, threading, traceback
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

# ---- Ajustes de la marca --------------------------------------------------
INTERVALO = 10.0   # segundos entre cada marca
INICIO = 2.0       # primera marca
BAJADA = 0.4       # duración de la bajada de volumen
SUBIDA = 0.5       # duración de la subida
NIVEL = 0.25       # volumen de la canción mientras suena la marca (25 %)
VOZ = 0.75         # volumen de la marca de voz
CALIDAD = "320k"   # AAC 320 kbps (tus originales vienen a 256 kbps)
MAX_TEMAS = 10
# Clave de la página. No la compartas: es la misma que usa el reproductor.
CLAVE_HEX = "d20b795057a6a88954c7b590cc85df5026e4d8ef7b6347bb081f97f2782b0066"
# ---------------------------------------------------------------------------

CONFIG = Path.home() / ".djmusicperu_top10.json"
NO_VENTANA = 0x08000000 if os.name == "nt" else 0  # oculta consolas de ffmpeg en Windows


def ejecutar(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, creationflags=NO_VENTANA)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-600:] or "ffmpeg falló")
    return r.stdout


def sonido(f):
    out = ejecutar(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                    "stream=sample_rate:format=duration", "-of", "json", str(f)])
    d = json.loads(out)
    return int(d["streams"][0]["sample_rate"]), float(d["format"]["duration"])


def leer_nombre(stem):
    """'92 Te Busco (Cosculluela, Nicky Jam).Splice2026 [Gustavo 2026]' -> datos."""
    s = re.sub(r"\s*\[[^\]]*\]\s*$", "", stem.replace("_", " ")).strip()   # quita [Editor]
    s = re.sub(r"\s*\([^)]*20\d\d\)\s*$", "", s).strip()                    # quita (Editor 2026)
    m = re.match(r"^(\d{2,3}(?:\s*-\s*\d{2,3})?)\s+(.*)$", s)
    bpm, resto = (re.sub(r"\s", "", m.group(1)), m.group(2)) if m else ("", s)
    artista = ""
    m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*[.\s]?\s*(.*)$", resto)
    if m:
        titulo, artista, tipo = m.group(1), m.group(2), m.group(3)
    else:
        partes = resto.rsplit(".", 1)
        titulo, tipo = (partes[0], partes[1]) if len(partes) == 2 else (resto, "")
    tipo = re.sub(r"\s*20\d\d\s*$", "", re.sub(r"(?<=[a-z])20\d\d$", "", tipo.strip(" .")))
    return {"title": titulo.strip(" ."), "artist": artista.strip(), "type": tipo or "Edición", "bpm": bpm}


def marcar(marca, entrada, salida):
    sr, dur = sonido(entrada)
    _, tag = sonido(marca)
    off = INICIO - BAJADA
    q = f"mod(t-{off},{INTERVALO})"
    hold = BAJADA + tag
    env = (f"if(lt(t,{off}),1,"
           f"if(lt({q},{BAJADA}),1-{1-NIVEL}*{q}/{BAJADA},"
           f"if(lt({q},{hold}),{NIVEL},"
           f"if(lt({q},{hold+SUBIDA}),{NIVEL}+{1-NIVEL}*({q}-{hold})/{SUBIDA},1))))")
    filtro = (
        f"[0:a]aresample={sr},aformat=channel_layouts=stereo,volume='{env}':eval=frame[m];"
        f"[1:a]aresample={sr},aformat=channel_layouts=stereo,volume={VOZ},"
        f"apad=whole_dur={INTERVALO},aloop=loop=-1:size={int(sr*INTERVALO)},"
        f"adelay={int(INICIO*1000)}|{int(INICIO*1000)},atrim=0:{dur}[v];"
        f"[m][v]amix=inputs=2:duration=first:normalize=0,"
        f"afade=t=in:d=0.5,afade=t=out:st={max(0, dur-2):.2f}:d=2[out]")
    ejecutar(["ffmpeg", "-v", "error", "-y", "-i", str(entrada), "-i", str(marca),
              "-filter_complex", filtro, "-map", "[out]", "-c:a", "aac", "-b:a", CALIDAD,
              "-ar", str(sr), "-movflags", "+faststart", str(salida)])
    return dur


def cifrar(origen, destino):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv = os.urandom(12)
    datos = AESGCM(bytes.fromhex(CLAVE_HEX)).encrypt(iv, Path(origen).read_bytes(), None)
    Path(destino).write_text(base64.b64encode(iv + datos).decode("ascii"))


def slug(t):
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t.lower()).strip("-")
    return t[:40] or "tema"


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("DJ Music Perú · Preparar Top 10")
        self.geometry("720x560")
        self.minsize(600, 480)
        cfg = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
        self.marca = tk.StringVar(value=cfg.get("marca", ""))
        self.salida = tk.StringVar(value=cfg.get("salida", str(Path.home() / "Desktop" / "Top10_listo")))
        self.guardar_audio = tk.BooleanVar(value=True)
        self.canciones = []

        pad = {"padx": 14, "pady": 6}
        ttk.Label(self, text="Preparar Top 10", font=("Segoe UI", 16, "bold")).pack(anchor="w", **pad)

        f1 = ttk.Frame(self); f1.pack(fill="x", **pad)
        ttk.Label(f1, text="Marca de voz:").pack(side="left")
        ttk.Entry(f1, textvariable=self.marca).pack(side="left", fill="x", expand=True, padx=8)
        ttk.Button(f1, text="Elegir…", command=self.elegir_marca).pack(side="left")

        f2 = ttk.Frame(self); f2.pack(fill="x", **pad)
        ttk.Label(f2, text="Carpeta de salida:").pack(side="left")
        ttk.Entry(f2, textvariable=self.salida).pack(side="left", fill="x", expand=True, padx=8)
        ttk.Button(f2, text="Elegir…", command=self.elegir_salida).pack(side="left")

        f3 = ttk.Frame(self); f3.pack(fill="x", **pad)
        ttk.Button(f3, text="Agregar canciones…", command=self.agregar).pack(side="left")
        ttk.Button(f3, text="Quitar seleccionada", command=self.quitar).pack(side="left", padx=6)
        ttk.Button(f3, text="Subir", command=lambda: self.mover(-1)).pack(side="left")
        ttk.Button(f3, text="Bajar", command=lambda: self.mover(1)).pack(side="left", padx=6)

        self.lista = tk.Listbox(self, height=10)
        self.lista.pack(fill="both", expand=True, **pad)

        ttk.Checkbutton(self, text="Guardar también una copia escuchable (con marca, sin cifrar) para revisar",
                        variable=self.guardar_audio).pack(anchor="w", **pad)

        self.barra = ttk.Progressbar(self, mode="determinate")
        self.barra.pack(fill="x", **pad)
        self.estado = ttk.Label(self, text="Agrega hasta 10 canciones en el orden del Top.")
        self.estado.pack(anchor="w", **pad)
        self.boton = ttk.Button(self, text="Procesar", command=self.iniciar)
        self.boton.pack(anchor="e", **pad)
        self.after(200, self.revisar_requisitos)

    def revisar_requisitos(self):
        faltan = []
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            faltan.append("• ffmpeg: abre una terminal y escribe  winget install ffmpeg  (luego reinicia el PC)")
        try:
            import cryptography  # noqa
        except ImportError:
            faltan.append("• cryptography: abre una terminal y escribe  pip install cryptography")
        if faltan:
            messagebox.showwarning("Falta instalar", "Para procesar necesitas:\n\n" + "\n".join(faltan))

    def elegir_marca(self):
        f = filedialog.askopenfilename(title="Marca de voz", filetypes=[("Audio", "*.mp3 *.wav *.m4a")])
        if f: self.marca.set(f)

    def elegir_salida(self):
        d = filedialog.askdirectory(title="Carpeta de salida")
        if d: self.salida.set(d)

    def agregar(self):
        fs = filedialog.askopenfilenames(title="Canciones originales",
                                         filetypes=[("Audio", "*.m4a *.mp3 *.wav *.flac *.aac")])
        for f in fs:
            if len(self.canciones) >= MAX_TEMAS:
                messagebox.showinfo("Top 10", "Ya tienes 10 canciones."); break
            self.canciones.append(f)
        self.refrescar()

    def quitar(self):
        for i in reversed(self.lista.curselection()):
            del self.canciones[i]
        self.refrescar()

    def mover(self, d):
        sel = self.lista.curselection()
        if not sel: return
        i = sel[0]; j = i + d
        if 0 <= j < len(self.canciones):
            self.canciones[i], self.canciones[j] = self.canciones[j], self.canciones[i]
            self.refrescar(); self.lista.selection_set(j)

    def refrescar(self):
        self.lista.delete(0, "end")
        for n, f in enumerate(self.canciones, 1):
            d = leer_nombre(Path(f).stem)
            art = f" ({d['artist']})" if d["artist"] else ""
            self.lista.insert("end", f"{n:02d}.  {d['title']}{art}   ·  {d['type']}  ·  {d['bpm'] or '?'} BPM")

    def iniciar(self):
        if not self.canciones:
            return messagebox.showinfo("Sin canciones", "Agrega al menos una canción.")
        if not Path(self.marca.get()).is_file():
            return messagebox.showinfo("Marca de voz", "Elige el archivo de la marca de voz.")
        CONFIG.write_text(json.dumps({"marca": self.marca.get(), "salida": self.salida.get()}))
        self.boton.config(state="disabled")
        threading.Thread(target=self.procesar, daemon=True).start()

    def avisar(self, texto, valor=None):
        def f():
            self.estado.config(text=texto)
            if valor is not None: self.barra.config(value=valor)
        self.after(0, f)

    def procesar(self):
        try:
            sal = Path(self.salida.get()); prev = sal / "previews"; esc = sal / "escuchar"
            prev.mkdir(parents=True, exist_ok=True)
            if self.guardar_audio.get(): esc.mkdir(exist_ok=True)
            pistas, total = [], len(self.canciones)
            for n, f in enumerate(self.canciones, 1):
                d = leer_nombre(Path(f).stem)
                self.avisar(f"Procesando {n} de {total}: {d['title']}…", (n - 1) / total * 100)
                nombre = f"{n:02d}-{slug(d['title'])}"
                tmp = sal / f"_{nombre}.m4a"
                dur = marcar(self.marca.get(), f, tmp)
                cifrar(tmp, prev / f"{nombre}.txt")
                if self.guardar_audio.get(): shutil.move(str(tmp), esc / f"{nombre}.m4a")
                else: tmp.unlink()
                d.update({"len": f"{int(dur // 60)}:{int(dur % 60):02d}", "enc": f"previews/{nombre}.txt"})
                pistas.append(d)
            (sal / "tracks.json").write_text(json.dumps(pistas, ensure_ascii=False, indent=2), encoding="utf-8")
            self.avisar(f"Listo: {total} canciones en {sal}", 100)
            self.after(0, lambda: messagebox.showinfo("Listo", f"Se prepararon {total} canciones.\n\nCarpeta: {sal}"))
            self.after(0, lambda: os.startfile(sal) if os.name == "nt" else None)
        except Exception as e:
            msg = str(e)
            self.avisar("Hubo un error. Revisa el mensaje.")
            self.after(0, lambda: messagebox.showerror("Error", msg + "\n\n" + traceback.format_exc()[-800:]))
        finally:
            self.after(0, lambda: self.boton.config(state="normal"))


if __name__ == "__main__":
    App().mainloop()
