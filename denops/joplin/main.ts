import { 
    Denops,
    vars,
    heper,
    japi,
} from "./deps.ts";

export async function main(denops: Denops): Promise<void> {
  const token = await vars.g.get(denops, "joplin_token", "");
  const port = await vars.g.get(denops, "joplin_port", 41184);

  let config = new japi.ApiClient();
  config.token = token;
  config.port = port;

  // API
  denops.dispatcher = {
      async winOpen(): Promise<unknown> {
          console.log(`${token}, ${port}`);

          const items = await japi.noteApi.list();
          await denops.cmd('enew');
          await denops.call('setline', 1, items);
      },

      async winClose(): Promise<unknown> {
          console.log('called winClose, this feature is under construction.');
      },

      async toggle(): Promise<unknown> {
          console.log('called toggle, this feature is under construction.');
      },

      async search(text: unknown): Promise<unknown> {
          console.log('called search, this feature is under construction.');
      },

      async saves(): Promise<unknown> {
          console.log('called save, this feature is under construction.');
      },

      async savesTodo(): Promise<unknown> {
          console.log('called saveTodo, this feature is under construction.');
      },

      async savesNote(): Promise<unknown> {
          console.log('called saveNote, this feature is under construction.');
      },
  };

  // define Commands
  await helper.execute(
      denops,
      `command! -nargs=0 JoplinWinOpen call denops#request('${denops.name}', 'winOpen', [])`,
  );
  await helper.execute(
      denops,
      `command! -nargs=0 JoplinWinClose call denops#request('${denops.name}', 'winClose', [])`,
  );
  await helper.execute(
      denops,
      `command! -nargs=0 JoplinToggle call denops#request('${denops.name}', 'toggle', [])`,
  );
  await helper.execute(
      denops,
      `command! -nargs=1 -complete=custom JoplinSaveAsTodo call denops#request('${denops.name}', 'saveTodo', [<q-args>])`,
  );
  await helper.execute(
      denops,
      `command! -nargs=1 -complete=custom JoplinSaveAsNote call denops#request('${denops.name}', 'saveNote', [<q-args>])`,
  );
  await helper.execute(
      denops,
      `command! -nargs=1 JoplinSearch echomsg denops#request('${denops.name}', 'search', [<q-args>])`,
  );
};
