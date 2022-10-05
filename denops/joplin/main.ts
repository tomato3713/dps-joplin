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

interface IProp {
    [name: string]: string | boolean;
}

export async function main(denops: Denops): Promise<void> {
    const debug: boolean = await vars.g.get(denops, "joplin_debug", false) as boolean;
    const consoleLog = (...data: unknown[]): void => {
        debug && console.log(...data);
    };

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

    const res2Text = (res: Array<any>, indent: string): string => {
        if( res == undefined ) return "";

        let str = "";
        for(const item of res) {
            const prop = {
                [ "title" ]: item.title,
                [ "id" ]: item.id,
                [ "is_notebook" ]: true,
                [ "is_todo" ]: false,
            };
            props.push(prop);
            str += indent + item.title + "\n";
            str += res2Text(item.children, indent + "  ");
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
            // 初期化
            props = [];
            // TODO: 他で開いていたら，そのバッファで上書きする．
            const title = 'JoplinNoteBooks Explorer'

            const res = await api.folderApi.listAll();
            consoleLog(res);

            const content = res2Text(res, "  ");

            const sep = "\n\n";

            const str = title + sep + content;

            await denops.cmd("new");
            await denops.call("setline", 1, str.split(/\r?\n/g))

            const bufnr = await fn.bufnr(denops, '%');
            for(let i = 0; i < props.length; i++) {
                await helper.execute(denops, `
                                     let s:namespace = nvim_create_namespace('joplin')
                                     call nvim_buf_set_extmark(${bufnr}, s:namespace, ${i + sep.length}, 0, {})
                                     if g:joplin_debug
                                         call nvim_buf_set_virtual_text(${bufnr}, s:namespace, ${i + sep.length}, [['${props[i]['title'] as string + ', ' + props[i]['id'] as string}', 'Comment']],{})
                                     endif
                                     `);
            }

            await helper.execute(denops, `
                                 setlocal bufhidden=unload nobuflisted
                                 setlocal nomodifiable
                                 setlocal nobackup noswapfile
                                 setlocal filetype=joplin
                                 setlocal buftype=nofile
                                 setlocal nowrap cursorline
                                 `);
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

    let props: IProp[];

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

