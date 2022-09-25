import { 
    Denops,
    vars,
    helper,
    batch,
    fn,
    bufname,
    japi,
} from "./deps.ts";

interface KeyMap {
    [name: string]: string[];
}

export async function main(denops: Denops): Promise<void> {
    const debug: boolean = await vars.g.get(denops, "joplin_debug", false);
    const consoleLog = (...data: any[]): void => {
        debug && console.log(...data);
    };

  // API
    denops.dispatcher = {
        async registerKeymap() {
            const keymap: KeyMap = {};
            keymap['openItem'] = ['<CR>', '<2-LeftMouse>'];
            for (const action in keymap) {
                const keys = keymap[action];
                for (const key of keys) {
                    await helper.execute(
                        denops,
                        `nnoremap <silent> <buffer> ${key} :call denops#request('${denops.name}', '${action}', [])<CR>`
                    );
                    consoleLog(`registered nnoremap, key: ${key}, action: ${action}`);
                }
            }
        },

        async openItem(): Promise<void> {
            const bufnr = await fn.bufnr(denops, '%', false);
            const line = await fn.line(denops, '.');

            const qflist = await fn.getqflist(denops);
            await denops.cmd(opener || "new");

            const noteRes = await api.noteApi.get(qflist[line -1].module, ['id', 'title', 'body']);
            await denops.call("setline", 1, noteRes.body.split(/\r?\n/));

            await helper.execute(denops, `
                setlocal bufhidden=hide
                setlocal nomodified
                setlocal nobackup noswapfile
                `);
        },

        async winOpen(): Promise<void> {
            await batch.batch(denops, async (denops) => {
                await fn.setqflist(denops, [], "r");
                await fn.setqflist(denops, [], "a", {
                    title: 'Joplin Note List',
                    context: 'JoplinWinOpen',
                });
                await denops.cmd("botright copen");
            });

            for(let pageIdx = 0,  more = true; more; pageIdx++) {
                const res = await api.noteApi.list(
                    {
                        page: pageIdx,
                    }
                );
                // let text = "";
                for(let i=0; i < res.items.length; i++) {
                    const title = res.items[i].title;
                    const id = res.items[i].id;
                    await fn.setqflist(denops, [], "a",
                                       {
                                           context: 'JoplinSearch',
                                           efm: "%o#%m",
                                           lines: [id + '#' + title],
                                       });
                }
                more = res.has_more;
            }
        },

        async winClose(): Promise<void> {
            console.log('called winClose, this feature is under construction.');
        },

        async toggle(): Promise<void> {
            console.log('called toggle, this feature is under construction.');
        },

        async search(text: unknown): Promise<void> {
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
        `command! -nargs=1 JoplinSaveAsTodo call denops#request('${denops.name}', 'saveTodo', [<q-args>])`,
    );
    await helper.execute(
        denops,
        `command! -nargs=1 JoplinSaveAsNote call denops#request('${denops.name}', 'saveNote', [<q-args>])`,
    );
    await helper.execute(
        denops,
        `command! -nargs=1 JoplinSearch echomsg denops#request('${denops.name}', 'search', [<q-args>])`,
    );

    const token = await vars.g.get(denops, "joplin_token", "");

    if (token == null) {
        console.log('joplin needs g:joplin_token');
        return;
    }

    const api = new japi.JoplinApiGenerator();
    api.token = token
    if(!await api.joplinApi.ping()) {
        console.log('no valid joplin app token. fix g:joplin_token');
        return;
    }

    const opener = await vars.g.get(denops, "joplin_opener", "")

    await helper.execute(
        denops, `
        augroup JoplinQFEnterAutoCmds
            autocmd!
            autocmd FileType qf call denops#request('${denops.name}', 'registerKeymap', [])
        augroup END
        `
    );
}

