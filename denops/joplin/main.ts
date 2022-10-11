import {
    Denops,
    vars,
    helper,
    batch,
    fn,
    autocmd,
    bufname,
    japi,
    unknownutil,
} from "./deps.ts";

interface KeyMap {
    [name: string]: string[];
}

type ItemTree = Pick<
    japi.FolderProperties,
    'id' | 'parent_id' | 'title'
> & Pick<
    japi.NoteProperties,
    'is_todo'
> & {
    children?: ItemTree[]
}

export async function main(denops: Denops): Promise<void> {
    const debug: boolean = await vars.g.get(denops, "joplin_debug", false) as boolean;
    const consoleLog = (...data: unknown[]): void => {
        debug && console.log(...data);
    };

    const namespace: number = await denops.call('nvim_create_namespace', 'joplin') as number;

    const createItem = async (title: string, parent_id: string, is_todo: boolean): Promise<unknown> => {
        const res = await api.noteApi.create({
            title: title,
            parent_id: parent_id,
            is_todo: is_todo,
            body: `# ${title}`
        });

        consoleLog(res);
        return res;
    };

    const _addExtMark = async (tree: ItemTree, bufnr: number, line: number): Promise<number> => {
            await denops.call("nvim_buf_set_extmark", bufnr, namespace, line, 0, { virt_text: [[tree.id]] });
            if(debug) {
//                 await denops.call(
//                     "nvim_buf_set_virtual_text", 
//                     bufnr,
//                     namespace,
//                     line,
//                     [[tree.title as string, 'Comment']],
//                     {});
            }

        for(const item of tree.children ?? []) {
            line = await _addExtMark(item, bufnr, ++line);
        }

        return line;
    };

    const openItemById = async (noteId: string): Promise<void> => {
        const noteRes: japi.NoteGetRes = await api.noteApi.get(noteId, [
            'id',
            'title',
            'body',
            'parent_id',
        ]);
        consoleLog(noteRes);

        await denops.cmd(opener || `new ${noteRes.title}`);
        await denops.call("setline", 1, noteRes.body.split(/\r?\n/));

        await vars.b.set(denops, "joplin_note_id", noteRes.id);
        await vars.b.set(denops, "joplin_note_title", noteRes.title);
        await helper.execute(denops, `
            setlocal bufhidden=hide
            setlocal nomodified
            setlocal nobackup noswapfile
            setlocal filetype=markdown
            `);
        await autocmd.group(denops,
                            "joplin",
                            (helper: autocmd.GroupHelper) => {
                                helper.define(
                                    "BufWriteCmd" as autocmd.AutocmdEvent,
                                    "<buffer>",
                                    `
                                    call denops#request('${denops.name}', 'update', [])
                                    `
                                );
                            });
    };

    const res2Text = (tree: ItemTree, indent: string): string => {
        let str = "";
        str += indent + "+ /" + tree.title + "\n";

        for(const item of tree.children ?? []) {
            str += res2Text(item, indent + "  ");
        }

        return str;
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
            const ft = await vars.localOptions.get(denops, "filetype")

            consoleLog(ft as string);

            let noteId = ""
            if(ft == "joplin") {
                const text = await fn.getline(denops, '.');
                consoleLog("open item line: ", text);
                return
            } else if (ft == "qf") {
                const line = await fn.line(denops, '.');
                const qflist = await fn.getqflist(denops);
                noteId = qflist[line -1].module as string;
            }
            openItemById(noteId);
        },

        async winOpen(): Promise<void> {
            await batch.batch(denops, async (denops) => {
                await fn.setqflist(denops, [], "r");
                await fn.setqflist(denops, [], "a", {
                    title: 'Joplin Note List',
                    context: 'joplin',
                });
                await denops.cmd("botright copen");
            });

            for(let pageIdx = 0,  more = true; more; pageIdx++) {
                const res = await api.noteApi.list(
                    {
                        page: pageIdx,
                    }
                );
                for(let i=0; i < res.items.length; i++) {
                    const title = res.items[i].title;
                    const id = res.items[i].id;
                    await fn.setqflist(denops, [], "a",
                                       {
                                           context: 'joplin',
                                           efm: "%o#%m",
                                           lines: [id + '#' + title],
                                       });
                }
                more = res.has_more;
            }
        },

        async winClose(): Promise<void> {
            await fn.setqflist(denops, [], "r",
                               {
                                   context: 'joplin'
                               });
                               await helper.execute(denops, `
                                                    cclose
                                                    `);
        },

        async openNotebook(): Promise<void> {
            const bufnr = await fn.bufadd(denops, "Joplin: NoteBooks");
            await denops.cmd(`buffer ${bufnr}`);
            await denops.cmd('setlocal modifiable nobuflisted');
            await denops.cmd('setlocal nobackup noswapfile');
            await denops.cmd('setlocal filetype=joplin buftype=nofile');

            if (itemTree == undefined) {
                consoleLog('init item tree');
                const items = await api.folderApi.listAll();
                if (items != undefined) {
                    itemTree = {
                        id: '',
                        parent_id: '',
                        title: '',
                        is_todo: false,
                        children: items as ItemTree[],
                    };
                }
                consoleLog(itemTree);
            }

            // clear buffer lines and extmark
            await denops.call("deletebufline", "%", 1, "$");
            await denops.call("nvim_buf_clear_namespace", bufnr, namespace, 0, -1);

            const content = res2Text(itemTree, "");
            await denops.call("setline", 1, content.split(/\r?\n/g))

            _addExtMark(itemTree, bufnr, 0);

            await denops.cmd('setlocal nomodifiable');
        },

        async search(text: unknown): Promise<void> {
            console.log('called search, this feature is under construction.');
        },

        async update(): Promise<void> {
            const id = await vars.b.get(denops, "joplin_note_id", "");
            const title = await vars.b.get(denops, "joplin_note_title", "");
            const body = await fn.join(denops, await fn.getline(denops, 1, "$"), "\n");

            const res = await api.noteApi.update({
                id: id,
                title: title,
                body: body,
            });

            consoleLog(res);

            await helper.execute(denops, `
                                 setlocal nomodified
                                 `);
        },

        async newTodo(title: unknown, parent_id: unknown = ''): Promise<void> {
            unknownutil.ensureString(title);
            unknownutil.ensureString(parent_id);

            if (parent_id.length == 0) {
            }

            const res = await createItem(title as string, parent_id as string, true);
            openItemById(res.id as string);
        },

        async newNote(title: unknown, parent_id: unknown = ''): Promise<void> {
            unknownutil.ensureString(title);
            unknownutil.ensureString(parent_id);

            const res = await createItem(title as string, parent_id as string, false);
            openItemById(res.id as string);
        },
    };

    // define Commands
    await helper.execute(
        denops, `
        command! -nargs=0 JoplinWinOpen      call denops#request('${denops.name}',      'winOpen', [])
        command! -nargs=0 JoplinWinClose     call denops#request('${denops.name}',     'winClose', [])
        command! -nargs=0 JoplinOpenNotebook call denops#request('${denops.name}', 'openNotebook', [])
        command! -nargs=1 JoplinNewTodo      call denops#request('${denops.name}',      'newTodo', [<q-args>])
        command! -nargs=1 JoplinNewNote      call denops#request('${denops.name}',      'newNote', [<q-args>])
        command! -nargs=1 JoplinSearch       call denops#request('${denops.name}',       'search', [<q-args>])
        `,
    );

    const token = await vars.g.get(denops, "joplin_token", "") as string;

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
    const opener = await vars.g.get(denops, "joplin_opener", "") as string

    let itemTree: ItemTree;

    await helper.execute(
        denops, `
        augroup joplin
        autocmd!
        autocmd FileType qf call denops#request('${denops.name}', 'registerKeymap', [])
        autocmd FileType joplin call denops#request('${denops.name}', 'registerKeymap', [])
        augroup END
        `
    );
}

