export type FakePutOptions = { allowOverwrite?: boolean; access?: string; token?: string; addRandomSuffix?: boolean; contentType?: string };

export const fakeBlob = {
  files: new Map<string, string>(),
  puts: [] as { path: string; allowOverwrite: boolean | undefined }[],
  failPutsFor: undefined as undefined | ((path: string) => Error | undefined),
  reset() {
    this.files.clear();
    this.puts.length = 0;
    this.failPutsFor = undefined;
  },
};

const yieldTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export const blobModule = {
  async put(path: string, body: string, options: FakePutOptions = {}) {
    await yieldTurn();
    fakeBlob.puts.push({ path, allowOverwrite: options.allowOverwrite });
    const failure = fakeBlob.failPutsFor?.(path);
    if (failure) throw failure;
    // Check and set run in one turn, like the real store's conditional create.
    if (!options.allowOverwrite && fakeBlob.files.has(path)) {
      throw new Error('This blob already exists, use `allowOverwrite: true` if you want to overwrite it.');
    }
    fakeBlob.files.set(path, body);
    return { pathname: path, url: `https://blob.example.test/${path}` };
  },
  async get(path: string) {
    await yieldTurn();
    const text = fakeBlob.files.get(path);
    if (text === undefined) return null;
    return { statusCode: 200, stream: new Response(text).body };
  },
};
