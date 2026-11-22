import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, Input, Label, NamedIcon, Select, ServerContentBlock, Spinner, httpErrorToHuman, toast, useCurrentServerUuid } from '@pterodactyl/sdk';
import { LOADERS, SOURCES, ago, api, count, type Context, type Filters, type Installed, type Project, type Source } from '../api';

const card = 'mdi:flex mdi:flex-col mdi:gap-3 mdi:rounded-lg mdi:border mdi:border-border mdi:bg-card mdi:p-4';

function Icon({ src, size = 'md' }: { src: string | null; size?: 'md' | 'lg' }) {
    const box = size === 'lg' ? 'mdi:size-16' : 'mdi:size-14';
    const [broken, setBroken] = useState(false);
    if (src && !broken) return <img src={src} alt={''} onError={() => setBroken(true)} className={`${box} mdi:shrink-0 mdi:rounded-lg mdi:bg-muted mdi:object-cover`} />;

    return <span className={`${box} mdi:flex mdi:shrink-0 mdi:items-center mdi:justify-center mdi:rounded-lg mdi:bg-muted mdi:text-2xl mdi:font-bold mdi:text-muted-foreground`}>?</span>;
}

function Author({ project }: { project: Project }) {
    if (!project.author_url) return <>{project.author}</>;
    return (
        <a href={project.author_url} target={'_blank'} rel={'noreferrer'} className={'mdi:hover:text-foreground mdi:hover:underline'}>
            {project.author}
        </a>
    );
}

function Title({ name, url }: { name: string; url: string | null }) {
    return (
        <p className={'mdi:flex mdi:min-w-0 mdi:items-center mdi:gap-1.5 mdi:font-semibold mdi:text-foreground'}>
            <span className={'mdi:truncate'}>{name}</span>
            {url && (
                <a href={url} target={'_blank'} rel={'noreferrer'} aria-label={'Open mod page'} className={'mdi:shrink-0 mdi:text-muted-foreground mdi:hover:text-foreground'}>
                    <NamedIcon name={'external-link'} size={14} />
                </a>
            )}
        </p>
    );
}

function Pages({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
    if (pages <= 1) return null;
    const start = Math.max(1, Math.min(page - 2, pages - 5));
    const list = Array.from({ length: Math.min(6, pages) }, (_, i) => start + i);
    const btn = (on: boolean) =>
        `mdi:flex mdi:size-9 mdi:items-center mdi:justify-center mdi:rounded-md mdi:border mdi:text-sm mdi:transition-colors mdi:disabled:opacity-40 ${on ? 'mdi:border-primary mdi:bg-primary mdi:text-primary-foreground' : 'mdi:border-border mdi:bg-card mdi:text-muted-foreground mdi:hover:text-foreground'}`;

    return (
        <div className={'mdi:flex mdi:flex-wrap mdi:items-center mdi:justify-center mdi:gap-1.5'}>
            {page > 1 && (
                <button type={'button'} aria-label={'Previous page'} className={btn(false)} onClick={() => onPage(page - 1)}>
                    <NamedIcon name={'chevrons-left'} size={15} />
                </button>
            )}
            {list.map((n) => (
                <button key={n} type={'button'} aria-current={n === page ? 'page' : undefined} className={btn(n === page)} onClick={() => onPage(n)}>
                    {n}
                </button>
            ))}
            {page < pages && (
                <button type={'button'} aria-label={'Next page'} className={btn(false)} onClick={() => onPage(page + 1)}>
                    <NamedIcon name={'chevrons-right'} size={15} />
                </button>
            )}
        </div>
    );
}

function DeleteDialog({ uuid, mod, onClose, onDone }: { uuid: string; mod: Installed | null; onClose: () => void; onDone: () => void }) {
    const [busy, setBusy] = useState(false);
    const remove = async () => {
        if (!mod) return;
        setBusy(true);
        try {
            await api.remove(uuid, mod.file);
            toast.success(`Deleted ${mod.name}. Restart the server to unload it.`);
            onDone();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog.Confirm open={mod !== null} title={'Delete this mod?'} confirm={'Delete'} pending={busy} onClose={onClose} onConfirmed={remove}>
            {mod?.file} will be deleted from the mods folder. Restart the server afterwards.
        </Dialog.Confirm>
    );
}

function VersionDialog({ uuid, filters, project, onClose, onDone }: { uuid: string; filters: Filters; project: Project; onClose: () => void; onDone: () => void }) {
    const versions = useQuery({ queryKey: ['mod-installer', uuid, 'versions', filters, project.id], queryFn: () => api.versions(uuid, filters, project.id) });
    const [picked, setPicked] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const chosen = picked ?? versions.data?.[0]?.id ?? null;

    const install = async () => {
        if (!chosen) return;
        setBusy(true);
        try {
            const result = await api.install(uuid, filters, project.id, chosen);
            toast.success(result.replaced.length ? `Updated ${project.name}. Restart the server to load it.` : `Installed ${project.name}. Restart the server to load it.`);
            onDone();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open title={project.name} onClose={() => !busy && onClose()}>
            <div className={'mdi:flex mdi:flex-col mdi:gap-4'}>
                <div className={'mdi:flex mdi:items-start mdi:gap-3'}>
                    <Icon src={project.icon} size={'lg'} />
                    <div className={'mdi:min-w-0'}>
                        {project.author && <p className={'mdi:text-sm mdi:text-muted-foreground'}>By <Author project={project} /></p>}
                        <p className={'mdi:mt-1 mdi:flex mdi:flex-wrap mdi:gap-x-3 mdi:text-xs mdi:text-muted-foreground'}>
                            <span className={'mdi:flex mdi:items-center mdi:gap-1'}>
                                <NamedIcon name={'download'} size={13} /> {count(project.downloads)} downloads
                            </span>
                            {project.stars > 0 && (
                                <span className={'mdi:flex mdi:items-center mdi:gap-1'}>
                                    <NamedIcon name={'star'} size={13} color={'#facc15'} fill={'#facc15'} /> {count(project.stars)}
                                </span>
                            )}
                            {project.updated && (
                                <span className={'mdi:flex mdi:items-center mdi:gap-1'}>
                                    <NamedIcon name={'calendar'} size={13} /> Updated {ago(project.updated)}
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                {project.description && <p className={'mdi:text-sm mdi:text-muted-foreground'}>{project.description}</p>}
                <div className={'mdi:flex mdi:flex-col mdi:gap-1.5'}>
                    <Label htmlFor={'mdi-version'}>Version</Label>
                    {versions.isLoading ? (
                        <Spinner size={'small'} />
                    ) : versions.error ? (
                        <Alert type={'danger'}>{httpErrorToHuman(versions.error)}</Alert>
                    ) : versions.data?.length ? (
                        <Select id={'mdi-version'} value={chosen} options={versions.data.map((v) => ({ value: v.id, label: v.name }))} onChange={(value) => setPicked(String(value))} />
                    ) : (
                        <Alert type={'warning'}>No version for {LOADERS[filters.loader]} {filters.version}. Try another version or loader in the filters.</Alert>
                    )}
                </div>
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose} disabled={busy}>
                    Cancel
                </Button.Text>
                <Button onClick={install} isLoading={busy} disabled={!chosen}>
                    Install mod
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}

function Browse({ uuid, ctx, filters, installed, onInstalled }: { uuid: string; ctx: Context; filters: Filters; installed: Installed[]; onInstalled: () => void }) {
    const [text, setText] = useState('');
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const [picked, setPicked] = useState<Project | null>(null);
    useEffect(() => {
        const timer = setTimeout(() => setQ(text.trim()), 400);
        return () => clearTimeout(timer);
    }, [text]);
    useEffect(() => setPage(1), [q, filters.source, filters.version, filters.loader]);

    const results = useQuery({ queryKey: ['mod-installer', uuid, 'search', filters, q, page], queryFn: () => api.search(uuid, filters, q, page), placeholderData: (prev) => prev });
    const pages = Math.max(1, Math.ceil((results.data?.total ?? 0) / 18));
    const [removing, setRemoving] = useState<Installed | null>(null);
    const find = (p: Project) => installed.find((i) => i.source === filters.source && i.project === p.id);

    return (
        <div className={'mdi:flex mdi:flex-col mdi:gap-4'}>
            <div className={'mdi:relative'}>
                <NamedIcon name={'search'} size={15} className={'mdi:pointer-events-none mdi:absolute mdi:left-3 mdi:top-1/2 mdi:-translate-y-1/2 mdi:text-muted-foreground'} />
                <Input className={'mdi:pl-9'} value={text} placeholder={`Search ${SOURCES[filters.source]} mods`} onChange={(e) => setText(e.target.value)} />
            </div>
            {results.error ? <Alert type={'danger'}>{httpErrorToHuman(results.error)}</Alert> : null}
            {results.isLoading && <Spinner centered />}
            {results.data && results.data.items.length === 0 && <p className={'mdi:py-12 mdi:text-center mdi:text-sm mdi:text-muted-foreground'}>No mods found.</p>}
            <div className={`mdi:grid mdi:grid-cols-1 mdi:gap-3 mdi:md:grid-cols-2 mdi:xl:grid-cols-3 ${results.isFetching ? 'mdi:opacity-60' : ''}`}>
                {results.data?.items.map((p) => (
                    <div key={p.id} className={card}>
                        <div className={'mdi:flex mdi:items-center mdi:gap-3'}>
                            <Icon src={p.icon} />
                            <div className={'mdi:min-w-0'}>
                                <Title name={p.name} url={p.url} />
                                {p.author && <p className={'mdi:truncate mdi:text-sm mdi:text-muted-foreground'}>By <Author project={p} /></p>}
                            </div>
                        </div>
                        <p className={'mdi:line-clamp-2 mdi:text-sm mdi:text-muted-foreground'}>{p.description}</p>
                        {p.updated && (
                            <p className={'mdi:flex mdi:items-center mdi:gap-1.5 mdi:text-xs mdi:text-muted-foreground'}>
                                <NamedIcon name={'calendar'} size={13} /> Updated {ago(p.updated)}
                            </p>
                        )}
                        <div className={'mdi:mt-auto mdi:flex mdi:items-center mdi:justify-between mdi:gap-3'}>
                            <span className={'mdi:flex mdi:items-center mdi:gap-3 mdi:text-xs mdi:text-muted-foreground'}>
                                <span className={'mdi:flex mdi:items-center mdi:gap-1'}>
                                    <NamedIcon name={'download'} size={13} /> {count(p.downloads)}
                                </span>
                                <span className={'mdi:flex mdi:items-center mdi:gap-1'}>
                                    <NamedIcon name={'star'} size={13} color={'#facc15'} fill={'#facc15'} /> {count(p.stars)}
                                </span>
                            </span>
                            {find(p) ? (
                                <Button.Danger size={'small'} disabled={!ctx.can.delete} onClick={() => setRemoving(find(p)!)}>
                                    <span className={'mdi:flex mdi:items-center mdi:gap-1.5'}>
                                        <NamedIcon name={'trash-2'} size={14} /> Delete
                                    </span>
                                </Button.Danger>
                            ) : !p.installable ? (
                                <span className={'mdi:text-xs mdi:text-muted-foreground'}>Website only</span>
                            ) : (
                                <Button size={'small'} disabled={!ctx.can.install} onClick={() => setPicked(p)}>
                                    Select version
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <Pages
                page={page}
                pages={pages}
                onPage={(n) => {
                    setPage(n);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
            />
            <DeleteDialog
                uuid={uuid}
                mod={removing}
                onClose={() => setRemoving(null)}
                onDone={() => {
                    setRemoving(null);
                    onInstalled();
                }}
            />
            {picked && (
                <VersionDialog
                    uuid={uuid}
                    filters={filters}
                    project={picked}
                    onClose={() => setPicked(null)}
                    onDone={() => {
                        setPicked(null);
                        onInstalled();
                    }}
                />
            )}
        </div>
    );
}

function InstalledList({ uuid, ctx, mods, loading, onChange }: { uuid: string; ctx: Context; mods: Installed[]; loading: boolean; onChange: () => void }) {
    const [removing, setRemoving] = useState<Installed | null>(null);
    const [text, setText] = useState('');
    const shown = mods.filter((p) => !text.trim() || p.name.toLowerCase().includes(text.trim().toLowerCase()) || p.file.toLowerCase().includes(text.trim().toLowerCase()));

    if (loading) return <Spinner centered />;

    return (
        <div className={'mdi:flex mdi:flex-col mdi:gap-4'}>
            <div className={'mdi:relative'}>
                <NamedIcon name={'search'} size={15} className={'mdi:pointer-events-none mdi:absolute mdi:left-3 mdi:top-1/2 mdi:-translate-y-1/2 mdi:text-muted-foreground'} />
                <Input className={'mdi:pl-9'} value={text} placeholder={'Search installed mods'} onChange={(e) => setText(e.target.value)} />
            </div>
            {mods.length === 0 && <p className={'mdi:py-12 mdi:text-center mdi:text-sm mdi:text-muted-foreground'}>No mods in the mods folder yet.</p>}
            <div className={'mdi:grid mdi:grid-cols-1 mdi:gap-3 mdi:md:grid-cols-2 mdi:xl:grid-cols-3'}>
                {shown.map((p) => (
                    <div key={p.file} className={`${card} mdi:flex-row mdi:items-center`}>
                        <Icon src={p.icon} />
                        <div className={'mdi:min-w-0 mdi:flex-1'}>
                            <Title name={p.name} url={p.url} />
                            <p className={'mdi:truncate mdi:text-sm mdi:text-muted-foreground'} title={p.file}>
                                {p.source ? `${SOURCES[p.source]}${p.version ? ` · ${p.version}` : ''}` : 'Added manually'}
                            </p>
                        </div>
                        {ctx.can.delete && (
                            <button
                                type={'button'}
                                aria-label={`Delete ${p.name}`}
                                title={'Delete'}
                                onClick={() => setRemoving(p)}
                                className={'mdi:flex mdi:size-9 mdi:shrink-0 mdi:items-center mdi:justify-center mdi:rounded-md mdi:bg-destructive mdi:text-white mdi:transition-opacity mdi:hover:opacity-85'}
                            >
                                <NamedIcon name={'trash-2'} size={16} />
                            </button>
                        )}
                    </div>
                ))}
            </div>
            <DeleteDialog
                uuid={uuid}
                mod={removing}
                onClose={() => setRemoving(null)}
                onDone={() => {
                    setRemoving(null);
                    onChange();
                }}
            />
        </div>
    );
}

export default function Mods() {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();
    const ctx = useQuery({ queryKey: ['mod-installer', uuid, 'context'], queryFn: () => api.context(uuid), staleTime: 60_000 });
    const installed = useQuery({ queryKey: ['mod-installer', uuid, 'installed'], queryFn: () => api.installed(uuid) });
    const [tab, setTab] = useState<'browse' | 'installed'>('browse');
    const [filters, setFilters] = useState<Filters | null>(null);
    const current: Filters | null = filters ?? (ctx.data ? { source: ctx.data.sources[0], version: ctx.data.version ?? '', loader: ctx.data.loader } : null);
    const set = (patch: Partial<Filters>) => current && setFilters({ ...current, ...patch });
    const refresh = () => client.invalidateQueries({ queryKey: ['mod-installer', uuid, 'installed'] });

    if (ctx.isLoading || !current) {
        return (
            <ServerContentBlock title={'Mods'}>
                {ctx.error ? <Alert type={'danger'}>{httpErrorToHuman(ctx.error)}</Alert> : <Spinner centered />}
            </ServerContentBlock>
        );
    }

    const tabClass = (on: boolean) =>
        `mdi:flex mdi:items-center mdi:gap-2 mdi:border-b-2 mdi:px-1 mdi:pb-2.5 mdi:text-sm mdi:font-medium mdi:transition-colors ${on ? 'mdi:border-primary mdi:text-foreground' : 'mdi:border-transparent mdi:text-muted-foreground mdi:hover:text-foreground'}`;

    return (
        <ServerContentBlock title={'Mods'}>
            <div className={'mdi:flex mdi:flex-col mdi:gap-4'}>
                <div className={'mdi:flex mdi:flex-col mdi:gap-3 mdi:border-b mdi:border-border mdi:lg:flex-row mdi:lg:items-end mdi:lg:justify-between'}>
                    <div className={'mdi:flex mdi:gap-6'}>
                        <button type={'button'} className={tabClass(tab === 'browse')} onClick={() => setTab('browse')}>
                            <NamedIcon name={'search'} size={15} /> Browse mods
                        </button>
                        <button type={'button'} className={tabClass(tab === 'installed')} onClick={() => setTab('installed')}>
                            <NamedIcon name={'puzzle'} size={15} /> Installed mods
                            <span className={'mdi:rounded-md mdi:bg-muted mdi:px-1.5 mdi:text-xs'}>{installed.data?.length ?? 0}</span>
                        </button>
                    </div>
                    {tab === 'browse' && (
                        <div className={'mdi:grid mdi:grid-cols-1 mdi:gap-2 mdi:pb-3 mdi:sm:grid-cols-3 mdi:lg:w-[34rem]'}>
                            <Select value={current.source} options={ctx.data!.sources.map((s) => ({ value: s, label: SOURCES[s] }))} onChange={(v) => set({ source: v as Source })} />
                            <Select
                                value={current.version || 'any'}
                                searchPlaceholder={'Find a version'}
                                options={[{ value: 'any', label: 'Any version' }, ...ctx.data!.versions.map((v) => ({ value: v, label: v }))]}
                                onChange={(v) => set({ version: v === 'any' ? '' : String(v) })}
                            />
                            <Select value={current.loader} options={ctx.data!.loaders.map((l) => ({ value: l, label: LOADERS[l] ?? l }))} onChange={(v) => set({ loader: String(v) })} />
                        </div>
                    )}
                </div>
                {tab === 'browse' ? (
                    <Browse uuid={uuid} ctx={ctx.data!} filters={current} installed={installed.data ?? []} onInstalled={refresh} />
                ) : (
                    <InstalledList uuid={uuid} ctx={ctx.data!} mods={installed.data ?? []} loading={installed.isLoading} onChange={refresh} />
                )}
            </div>
        </ServerContentBlock>
    );
}
