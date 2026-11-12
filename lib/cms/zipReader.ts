import yauzl from "yauzl";

/**
 * ZIP archives read straight from the disk (central directory + one entry at a time): an archive with
 * thousands of photos is never loaded into memory whole. Folders, macOS service files and
 * non-pictures are skipped; one picture may not be bigger than MAX_ENTRY.
 */
export const MAX_ENTRY = 40 * 1024 * 1024;
export const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

export type ZipEntryInfo = { name: string; size: number };

function open(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (err, zf) => (err || !zf ? reject(err ?? new Error("zip")) : resolve(zf)))
  );
}

const usable = (name: string) => IMAGE_RE.test(name) && !/(^|\/)(__MACOSX|\.)/.test(name) && !name.endsWith("/");

/** picture entries of the archive (names with folders, uncompressed sizes) */
export async function listZipImages(path: string, maxFiles = 20000): Promise<ZipEntryInfo[]> {
  const zf = await open(path);
  try {
    return await new Promise<ZipEntryInfo[]>((resolve, reject) => {
      const out: ZipEntryInfo[] = [];
      zf.on("entry", (e: yauzl.Entry) => {
        if (usable(e.fileName)) {
          out.push({ name: e.fileName, size: e.uncompressedSize });
          if (out.length > maxFiles) return reject(new Error(`В архиве больше ${maxFiles} фото — разбейте его на части`));
        }
        zf.readEntry();
      });
      zf.on("end", () => resolve(out));
      zf.on("error", reject);
      zf.readEntry();
    });
  } finally {
    zf.close();
  }
}

/** reads the named entries, calling `onFile` for each (one in memory at a time) */
export async function readZipEntries(path: string, names: Set<string>, onFile: (name: string, data: Buffer) => Promise<void>): Promise<void> {
  const zf = await open(path);
  try {
    await new Promise<void>((resolve, reject) => {
      zf.on("entry", (e: yauzl.Entry) => {
        if (!names.has(e.fileName)) return zf.readEntry();
        if (e.uncompressedSize > MAX_ENTRY) {
          onFile(e.fileName, Buffer.alloc(0)).then(() => zf.readEntry(), reject);
          return;
        }
        zf.openReadStream(e, (err, stream) => {
          if (err || !stream) return reject(err ?? new Error("zip entry"));
          const chunks: Buffer[] = [];
          let total = 0;
          stream.on("data", (c: Buffer) => {
            total += c.length;
            if (total > MAX_ENTRY) stream.destroy(new Error("Файл в архиве больше 40 МБ"));
            else chunks.push(c);
          });
          stream.on("error", reject);
          stream.on("end", () => onFile(e.fileName, Buffer.concat(chunks)).then(() => zf.readEntry(), reject));
        });
      });
      zf.on("end", () => resolve());
      zf.on("error", reject);
      zf.readEntry();
    });
  } finally {
    zf.close();
  }
}
