"""
DJ Music Perú - Preparar Top 10
--------------------------------
Programa con ventana: eliges tus canciones originales (M4A, MP3, WAV, AIF/AIFF,
FLAC o AAC) y te entrega cada una recortada a una vista previa, con la marca de
voz, los desvanecimientos cada 10 s y cifrada, lista para subir a la página.
También genera tracks.json con los datos que ves (y puedes corregir) en la tabla.

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
CALIDAD = "320k"   # AAC 320 kbps
RECORTE = 90       # duración de la vista previa en segundos (0 = canción completa)
MAX_TEMAS = 10
LIMITE_WEB_MB = 25 # límite de GitHub al subir desde el navegador
FORMATOS = (".m4a", ".mp3", ".wav", ".aif", ".aiff", ".flac", ".aac")
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


def limpiar(s):
    s = re.sub(r"\s+", " ", s.replace("_", " ")).strip(" .-–")
    return s


def leer_nombre(stem):
    """Lee BPM, título, artista y tipo del nombre del archivo. Formatos que entiende:
       '92 Te Busco (Cosculluela, Nicky Jam).Splice2026 [Editor 2026]'
       '133 Esaud Suarez - Porque Un Hombre No Llora (Coro Acapella) [Editor]'
       '130 La Calabaza x Loba (Mashup Guaracha TT) [Editor]'
    Lo que no salga bien se corrige en la tabla antes de procesar."""
    s = stem.replace("_", " ")
    s = re.sub(r"\s*\[[^\]]*\]\s*$", "", s).strip()                 # quita [Editor 2026]
    s = re.sub(r"\s*\((?:[^()]*\bDJ\b[^()]*|[^()]*20\d\d)\)\s*$", "", s).strip()  # quita (Editor 2026)
    m = re.match(r"^(\d{2,3}(?:\s*-\s*\d{2,3})?)\s+(.*)$", s)
    bpm, resto = (re.sub(r"\s", "", m.group(1)).lstrip("0"), m.group(2)) if m else ("", s)
    bpm = re.sub(r"-0+", "-", bpm)
    titulo, artista, tipo = resto, "", ""
    m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*[.\s]?\s*(.*)$", resto)
    if m:
        antes, paren, despues = m.group(1), m.group(2), m.group(3)
        if despues:                       # Título (Artista).Tipo
            titulo, artista, tipo = antes, paren, despues
        elif " - " in antes:              # Artista - Título (Tipo)
            artista, titulo = antes.split(" - ", 1)
            tipo = paren
        else:                             # Título (Tipo)
            titulo, tipo = antes, paren
    elif " - " in resto:                  # Artista - Título
        artista, titulo = resto.split(" - ", 1)
    else:
        partes = resto.rsplit(".", 1)
        if len(partes) == 2 and len(partes[1]) < 30:
            titulo, tipo = partes
    tipo = re.sub(r"(?<=[A-Za-z])20\d\d$", "", limpiar(tipo))
    tipo = re.sub(r"\s*20\d\d$", "", tipo)
    return {"title": limpiar(titulo), "artist": limpiar(artista), "type": tipo or "Edición", "bpm": bpm}


def marcar(marca, entrada, salida, recorte):
    sr, dur_total = sonido(entrada)
    sr = min(sr, 48000)
    dur = min(dur_total, recorte) if recorte else dur_total
    _, tag = sonido(marca)
    off = INICIO - BAJADA
    q = f"mod(t-{off},{INTERVALO})"
    hold = BAJADA + tag
    env = (f"if(lt(t,{off}),1,"
           f"if(lt({q},{BAJADA}),1-{1-NIVEL}*{q}/{BAJADA},"
           f"if(lt({q},{hold}),{NIVEL},"
           f"if(lt({q},{hold+SUBIDA}),{NIVEL}+{1-NIVEL}*({q}-{hold})/{SUBIDA},1))))")
    filtro = (
        f"[0:a]aresample={sr},aformat=channel_layouts=stereo,atrim=0:{dur:.3f},volume='{env}':eval=frame[m];"
        f"[1:a]aresample={sr},aformat=channel_layouts=stereo,volume={VOZ},"
        f"apad=whole_dur={INTERVALO},aloop=loop=-1:size={int(sr*INTERVALO)},"
        f"adelay={int(INICIO*1000)}|{int(INICIO*1000)},atrim=0:{dur:.3f}[v];"
        f"[m][v]amix=inputs=2:duration=first:normalize=0,"
        f"afade=t=in:d=0.5,afade=t=out:st={max(0, dur-3):.2f}:d=3[out]")
    ejecutar(["ffmpeg", "-v", "error", "-y", "-t", f"{dur + 1:.3f}", "-i", str(entrada), "-i", str(marca),
              "-filter_complex", filtro, "-map", "[out]", "-vn", "-c:a", "aac", "-b:a", CALIDAD,
              "-ar", str(sr), "-movflags", "+faststart", str(salida)])
    return dur


def cifrar(origen, destino):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv = os.urandom(12)
    datos = AESGCM(bytes.fromhex(CLAVE_HEX)).encrypt(iv, Path(origen).read_bytes(), None)
    Path(destino).write_bytes(iv + datos)


def slug(t):
    t = t.lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n"), ("ü", "u")):
        t = t.replace(a, b)
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:40].strip("-") or "tema"


class App(tk.Tk):
    COLS = (("title", "Título", 230), ("artist", "Artista", 190), ("type", "Tipo", 150), ("bpm", "BPM", 70))

    def __init__(self):
        super().__init__()
        self.title("DJ Music Perú · Preparar Top 10")
        self.geometry("900x640")
        self.minsize(760, 560)
        cfg = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
        self.marca = tk.StringVar(value=cfg.get("marca", ""))
        self.salida = tk.StringVar(value=cfg.get("salida", str(Path.home() / "Desktop" / "Top10_listo")))
        self.recorte = tk.IntVar(value=cfg.get("recorte", RECORTE))
        self.guardar_audio = tk.BooleanVar(value=True)
        self.temas = []   # [{"archivo":..., "title":..., "artist":..., "type":..., "bpm":...}]

        pad = {"padx": 14, "pady": 5}
        ttk.Label(self, text="Preparar Top 10", font=("Segoe UI", 16, "bold")).pack(anchor="w", **pad)

        for etiqueta, var, cmd in (("Marca de voz:", self.marca, self.elegir_marca),
                                   ("Carpeta de salida:", self.salida, self.elegir_salida)):
            f = ttk.Frame(self); f.pack(fill="x", **pad)
            ttk.Label(f, text=etiqueta, width=16).pack(side="left")
            ttk.Entry(f, textvariable=var).pack(side="left", fill="x", expand=True, padx=8)
            ttk.Button(f, text="Elegir…", command=cmd).pack(side="left")

        f = ttk.Frame(self); f.pack(fill="x", **pad)
        ttk.Label(f, text="Duración de la vista previa:", width=24).pack(side="left")
        ttk.Spinbox(f, from_=0, to=600, increment=15, textvariable=self.recorte, width=6).pack(side="left")
        ttk.Label(f, text="segundos  (90 recomendado · 0 = canción completa)").pack(side="left", padx=6)

        f = ttk.Frame(self); f.pack(fill="x", **pad)
        ttk.Button(f, text="Agregar canciones…", command=self.agregar).pack(side="left")
        ttk.Button(f, text="Quitar seleccionada", command=self.quitar).pack(side="left", padx=6)
        ttk.Button(f, text="Subir", command=lambda: self.mover(-1)).pack(side="left")
        ttk.Button(f, text="Bajar", command=lambda: self.mover(1)).pack(side="left", padx=6)
        ttk.Label(f, text="M4A · MP3 · WAV · AIF · FLAC", foreground="#666").pack(side="right")

        caja = ttk.Frame(self); caja.pack(fill="both", expand=True, **pad)
        self.tabla = ttk.Treeview(caja, columns=[c[0] for c in self.COLS], show="tree headings", height=10, selectmode="browse")
        self.tabla.heading("#0", text="#"); self.tabla.column("#0", width=40, stretch=False)
        for key, txt, w in self.COLS:
            self.tabla.heading(key, text=txt); self.tabla.column(key, width=w)
        self.tabla.pack(side="left", fill="both", expand=True)
        sb = ttk.Scrollbar(caja, orient="vertical", command=self.tabla.yview); sb.pack(side="left", fill="y")
        self.tabla.configure(yscrollcommand=sb.set)
        self.tabla.bind("<<TreeviewSelect>>", self.cargar_edicion)

        # Editor de la canción seleccionada
        ed = ttk.LabelFrame(self, text="Corregir datos de la canción seleccionada (así se verán en la página)")
        ed.pack(fill="x", **pad)
        self.campos = {}
        for i, (key, txt, _) in enumerate(self.COLS):
            ttk.Label(ed, text=txt + ":").grid(row=0, column=i * 2, sticky="w", padx=(8, 4), pady=6)
            v = tk.StringVar(); self.campos[key] = v
            e = ttk.Entry(ed, textvariable=v, width=8 if key == "bpm" else 22)
            e.grid(row=0, column=i * 2 + 1, sticky="we", padx=(0, 8), pady=6)
            e.bind("<Return>", lambda _e: self.aplicar())
        ttk.Button(ed, text="Aplicar cambios", command=self.aplicar).grid(row=1, column=0, columnspan=8, sticky="e", padx=8, pady=(0, 8))
        for c in (1, 3, 5): ed.columnconfigure(c, weight=1)

        ttk.Checkbutton(self, text="Guardar también una copia escuchable (con marca, sin cifrar) para revisar",
                        variable=self.guardar_audio).pack(anchor="w", **pad)
        self.barra = ttk.Progressbar(self, mode="determinate"); self.barra.pack(fill="x", **pad)
        self.estado = ttk.Label(self, text="Agrega hasta 10 canciones en el orden del Top. Revisa título, artista y tipo antes de procesar.")
        self.estado.pack(anchor="w", **pad)
        self.boton = ttk.Button(self, text="Procesar", command=self.iniciar); self.boton.pack(anchor="e", **pad)
        self.after(200, self.revisar_requisitos)

    # ---- requisitos y selección de archivos ----
    def revisar_requisitos(self):
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            messagebox.showwarning("Falta instalar ffmpeg",
                                   "Para procesar necesitas ffmpeg.\n\nAbre una terminal (cmd), escribe:\n\n    winget install ffmpeg\n\ny luego reinicia el PC.")
        try:
            import cryptography  # noqa
        except ImportError:
            if messagebox.askyesno("Instalar componente",
                                   "Falta un componente para cifrar los audios (cryptography).\n\n"
                                   "¿Lo instalo ahora automáticamente? Solo se hace una vez y necesita internet."):
                self.estado.config(text="Instalando componente de cifrado… (puede tardar un minuto)")
                self.boton.config(state="disabled")
                threading.Thread(target=self.instalar_cryptography, daemon=True).start()

    def instalar_cryptography(self):
        # Usa el mismo Python que abrió este programa (evita instalarlo en otra versión de Python).
        py = Path(sys.executable)
        if py.name.lower() == "pythonw.exe" and (py.parent / "python.exe").exists():
            py = py.parent / "python.exe"
        r = subprocess.run([str(py), "-m", "pip", "install", "--user", "cryptography"],
                           capture_output=True, text=True, creationflags=NO_VENTANA)
        if r.returncode != 0:  # algunos Python no aceptan --user
            r = subprocess.run([str(py), "-m", "pip", "install", "cryptography"],
                               capture_output=True, text=True, creationflags=NO_VENTANA)
        ok = r.returncode == 0
        if ok:
            import importlib, site
            try:
                usr = site.getusersitepackages()
                if usr not in sys.path: sys.path.append(usr)
            except Exception:
                pass
            importlib.invalidate_caches()
            try:
                import cryptography  # noqa
            except ImportError:
                ok = False
        def fin():
            self.boton.config(state="normal")
            if ok:
                self.estado.config(text="Componente instalado. Ya puedes procesar canciones.")
                messagebox.showinfo("Listo", "Componente instalado. Este aviso ya no volverá a aparecer.")
            else:
                self.estado.config(text="No se pudo instalar el componente.")
                messagebox.showerror("No se pudo instalar",
                                     "Abre una terminal (cmd) y escribe exactamente:\n\n"
                                     f'    "{py}" -m pip install cryptography\n\n'
                                     "Detalle:\n" + (r.stderr or r.stdout)[-500:])
        self.after(0, fin)

    def elegir_marca(self):
        f = filedialog.askopenfilename(title="Marca de voz", filetypes=[("Audio", " ".join("*" + x for x in FORMATOS))])
        if f: self.marca.set(f)

    def elegir_salida(self):
        d = filedialog.askdirectory(title="Carpeta de salida")
        if d: self.salida.set(d)

    def agregar(self):
        tipos = [("Audio", " ".join("*" + x for x in FORMATOS + tuple(x.upper() for x in FORMATOS))), ("Todos", "*.*")]
        fs = filedialog.askopenfilenames(title="Canciones originales (sin marca)", filetypes=tipos)
        for f in fs:
            if Path(f).suffix.lower() not in FORMATOS:
                messagebox.showinfo("Formato", f"{Path(f).name}\nno es un formato admitido (M4A, MP3, WAV, AIF, FLAC, AAC)."); continue
            if len(self.temas) >= MAX_TEMAS:
                messagebox.showinfo("Top 10", "Ya tienes 10 canciones."); break
            d = leer_nombre(Path(f).stem); d["archivo"] = f
            self.temas.append(d)
        self.refrescar()

    def quitar(self):
        i = self.indice()
        if i is not None:
            del self.temas[i]; self.refrescar()

    def mover(self, d):
        i = self.indice()
        if i is None: return
        j = i + d
        if 0 <= j < len(self.temas):
            self.temas[i], self.temas[j] = self.temas[j], self.temas[i]
            self.refrescar(j)

    def indice(self):
        sel = self.tabla.selection()
        return self.tabla.index(sel[0]) if sel else None

    def refrescar(self, seleccionar=None):
        self.tabla.delete(*self.tabla.get_children())
        for n, t in enumerate(self.temas, 1):
            self.tabla.insert("", "end", text=f"{n:02d}", values=[t[c[0]] for c in self.COLS])
        if seleccionar is not None and seleccionar < len(self.temas):
            item = self.tabla.get_children()[seleccionar]
            self.tabla.selection_set(item); self.tabla.see(item)

    def cargar_edicion(self, _e=None):
        i = self.indice()
        if i is None: return
        for key, v in self.campos.items(): v.set(self.temas[i].get(key, ""))

    def aplicar(self):
        i = self.indice()
        if i is None:
            return messagebox.showinfo("Corregir", "Primero selecciona una canción en la tabla.")
        for key, v in self.campos.items(): self.temas[i][key] = v.get().strip()
        if not self.temas[i]["type"]: self.temas[i]["type"] = "Edición"
        self.refrescar(i)

    # ---- proceso ----
    def iniciar(self):
        if not self.temas:
            return messagebox.showinfo("Sin canciones", "Agrega al menos una canción.")
        if not Path(self.marca.get()).is_file():
            return messagebox.showinfo("Marca de voz", "Elige el archivo de la marca de voz.")
        try:
            recorte = max(0, int(self.recorte.get()))
        except (tk.TclError, ValueError):
            return messagebox.showinfo("Duración", "Escribe la duración en segundos (por ejemplo 90).")
        CONFIG.write_text(json.dumps({"marca": self.marca.get(), "salida": self.salida.get(), "recorte": recorte}))
        self.boton.config(state="disabled")
        threading.Thread(target=self.procesar, args=(recorte,), daemon=True).start()

    def avisar(self, texto, valor=None):
        def f():
            self.estado.config(text=texto)
            if valor is not None: self.barra.config(value=valor)
        self.after(0, f)

    def procesar(self, recorte):
        try:
            sal = Path(self.salida.get()); prev = sal / "previews"; esc = sal / "escuchar"
            if prev.exists(): shutil.rmtree(prev)
            prev.mkdir(parents=True, exist_ok=True)
            if self.guardar_audio.get(): esc.mkdir(exist_ok=True)
            pistas, grandes, total = [], [], len(self.temas)
            for n, t in enumerate(self.temas, 1):
                self.avisar(f"Procesando {n} de {total}: {t['title']}…", (n - 1) / total * 100)
                nombre = f"{n:02d}-{slug((t['artist'] + ' ' if t['artist'] else '') + t['title'])}"
                tmp = sal / f"_{nombre}.m4a"
                dur = marcar(self.marca.get(), t["archivo"], tmp, recorte)
                destino = prev / f"{nombre}.bin"
                cifrar(tmp, destino)
                mb = destino.stat().st_size / 1e6
                if mb > LIMITE_WEB_MB: grandes.append(f"{destino.name} ({mb:.0f} MB)")
                if self.guardar_audio.get(): shutil.move(str(tmp), esc / f"{nombre}.m4a")
                else: tmp.unlink()
                pistas.append({"title": t["title"], "artist": t["artist"], "type": t["type"], "bpm": t["bpm"],
                               "len": f"{int(dur // 60)}:{int(dur % 60):02d}", "enc": f"previews/{nombre}.bin"})
            (sal / "tracks.json").write_text(json.dumps(pistas, ensure_ascii=False, indent=2), encoding="utf-8")
            msg = f"Se prepararon {total} canciones.\n\nCarpeta: {sal}\n\nSube a GitHub la carpeta 'previews' y 'tracks.json' (no subas 'escuchar')."
            if grandes:
                msg += ("\n\nAtención: estos archivos pasan los 25 MB que acepta GitHub desde el navegador:\n• "
                        + "\n• ".join(grandes) + "\nBaja la duración de la vista previa o envíalos a Claude para subirlos.")
            self.avisar(f"Listo: {total} canciones en {sal}", 100)
            self.after(0, lambda: messagebox.showinfo("Listo", msg))
            self.after(0, lambda: os.startfile(sal) if os.name == "nt" else None)
        except Exception as e:
            msg = str(e)
            self.avisar("Hubo un error. Revisa el mensaje.")
            self.after(0, lambda: messagebox.showerror("Error", msg + "\n\n" + traceback.format_exc()[-800:]))
        finally:
            self.after(0, lambda: self.boton.config(state="normal"))


if __name__ == "__main__":
    App().mainloop()
