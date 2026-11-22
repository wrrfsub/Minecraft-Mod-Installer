<?php

namespace ModInstaller;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Extensions\ExtensionRepository;

final class Sources
{
    public const LIMIT = 18;

    public const LOADERS = ['fabric', 'forge', 'neoforge', 'quilt'];

    private const COMPATIBLE = [
        'fabric' => ['fabric'],
        'forge' => ['forge'],
        'neoforge' => ['neoforge'],
        'quilt' => ['quilt', 'fabric'],
    ];

    private const CURSEFORGE_LOADERS = ['forge' => 1, 'fabric' => 4, 'quilt' => 5, 'neoforge' => 6];

    public static function curseforgeKey(): string
    {
        return (string) app(ExtensionRepository::class)->settings('mod-installer')->get('curseforge_key');
    }

    public static function available(): array
    {
        return array_values(array_filter(['modrinth', self::curseforgeKey() !== '' ? 'curseforge' : null]));
    }

    private static function http(): PendingRequest
    {
        return Http::timeout(15)->acceptJson()->withUserAgent('s4way/mod-installer (Pterodactyl)');
    }

    private static function get(string $url, array $query = [], array $headers = []): array
    {
        $response = self::http()->withHeaders($headers)->get($url, $query);
        if (! $response->successful()) {
            throw new DisplayException('The mod site did not answer ('.$response->status().'). Try again in a moment.');
        }

        return (array) $response->json();
    }

    private static function cached(array $key, callable $fn): mixed
    {
        return Cache::remember('mod-installer:'.sha1(json_encode($key)), 300, $fn);
    }

    public static function gameVersions(): array
    {
        return Cache::remember('mod-installer:game-versions', 86400, fn () => collect(self::get('https://api.modrinth.com/v2/tag/game_version'))
            ->where('version_type', 'release')->pluck('version')->take(40)->values()->all());
    }

    public static function search(string $source, string $query, int $page, ?string $version, string $loader): array
    {
        return self::cached([$source, $query, $page, $version, $loader], fn () => match ($source) {
            'modrinth' => self::modrinthSearch($query, $page, $version, $loader),
            'curseforge' => self::curseforgeSearch($query, $page, $version, $loader),
        });
    }

    public static function versions(string $source, string $id, ?string $version, string $loader): array
    {
        return self::cached(['v', $source, $id, $version, $loader], fn () => match ($source) {
            'modrinth' => self::modrinthVersions($id, $version, $loader),
            'curseforge' => self::curseforgeVersions($id, $version, $loader),
        });
    }

    public static function project(string $source, string $id): array
    {
        return self::cached(['p', $source, $id], fn () => match ($source) {
            'modrinth' => self::modrinthProject(self::get("https://api.modrinth.com/v2/project/$id")),
            'curseforge' => self::curseforgeProject(self::get("https://api.curseforge.com/v1/mods/$id", [], ['x-api-key' => self::curseforgeKey()])['data'] ?? []),
        });
    }

    public static function version(string $source, string $id, string $versionId, ?string $version, string $loader): array
    {
        return collect(self::versions($source, $id, $version, $loader))->firstWhere('id', $versionId)
            ?? throw new DisplayException('That version is not available anymore.');
    }

    public static function finalUrl(string $url): string
    {
        for ($i = 0; $i < 5; $i++) {
            $response = self::http()->withOptions(['allow_redirects' => false])->head($url);
            $location = $response->header('Location');
            if (! $response->redirect() || $location === '') {
                break;
            }
            $url = str_starts_with($location, 'http') ? $location : parse_url($url, PHP_URL_SCHEME).'://'.parse_url($url, PHP_URL_HOST).$location;
        }

        return $url;
    }

    private static function modrinthProject(array $p): array
    {
        $slug = $p['slug'] ?? $p['project_id'] ?? $p['id'];

        return [
            'id' => $p['project_id'] ?? $p['id'],
            'name' => $p['title'],
            'author' => $p['author'] ?? null,
            'author_url' => isset($p['author']) ? 'https://modrinth.com/user/'.rawurlencode($p['author']) : null,
            'description' => $p['description'] ?? '',
            'icon' => $p['icon_url'] ?: null,
            'downloads' => $p['downloads'] ?? 0,
            'stars' => $p['follows'] ?? $p['followers'] ?? 0,
            'updated' => $p['date_modified'] ?? $p['updated'] ?? null,
            'url' => "https://modrinth.com/mod/$slug",
            'installable' => true,
        ];
    }

    private static function modrinthSearch(string $query, int $page, ?string $version, string $loader): array
    {
        $facets = [['project_type:mod'], ['server_side:required', 'server_side:optional'], array_map(fn ($l) => "categories:$l", self::COMPATIBLE[$loader])];
        if ($version) {
            $facets[] = ["versions:$version"];
        }
        $data = self::get('https://api.modrinth.com/v2/search', [
            'query' => $query,
            'limit' => self::LIMIT,
            'offset' => ($page - 1) * self::LIMIT,
            'index' => $query === '' ? 'downloads' : 'relevance',
            'facets' => json_encode($facets),
        ]);

        return ['items' => array_map(self::modrinthProject(...), $data['hits'] ?? []), 'total' => $data['total_hits'] ?? 0];
    }

    private static function modrinthVersions(string $id, ?string $version, string $loader): array
    {
        $data = self::get("https://api.modrinth.com/v2/project/$id/version", array_filter([
            'loaders' => json_encode(self::COMPATIBLE[$loader]),
            'game_versions' => $version ? json_encode([$version]) : null,
        ]));

        return collect($data)->map(function (array $v) {
            $file = collect($v['files'] ?? [])->firstWhere('primary', true) ?? ($v['files'][0] ?? null);

            return $file ? ['id' => $v['id'], 'name' => $v['version_number'].($v['name'] && $v['name'] !== $v['version_number'] ? " ({$v['name']})" : ''), 'file' => $file['filename'], 'url' => $file['url']] : null;
        })->filter()->take(25)->values()->all();
    }

    private static function curseforgeProject(array $p): array
    {
        return [
            'id' => (string) $p['id'],
            'name' => $p['name'],
            'author' => $p['authors'][0]['name'] ?? null,
            'author_url' => $p['authors'][0]['url'] ?? null,
            'description' => $p['summary'] ?? '',
            'icon' => $p['logo']['thumbnailUrl'] ?? null,
            'downloads' => $p['downloadCount'] ?? 0,
            'stars' => $p['thumbsUpCount'] ?? 0,
            'updated' => $p['dateModified'] ?? null,
            'url' => $p['links']['websiteUrl'] ?? null,
            'installable' => ($p['allowModDistribution'] ?? true) !== false,
        ];
    }

    private static function curseforgeSearch(string $query, int $page, ?string $version, string $loader): array
    {
        $data = self::get('https://api.curseforge.com/v1/mods/search', array_filter([
            'gameId' => 432,
            'classId' => 6,
            'modLoaderType' => self::CURSEFORGE_LOADERS[$loader],
            'searchFilter' => $query ?: null,
            'gameVersion' => $version,
            'sortField' => 2,
            'sortOrder' => 'desc',
            'pageSize' => self::LIMIT,
            'index' => ($page - 1) * self::LIMIT,
        ]), ['x-api-key' => self::curseforgeKey()]);

        return ['items' => array_map(self::curseforgeProject(...), $data['data'] ?? []), 'total' => min($data['pagination']['totalCount'] ?? 0, 10000 - self::LIMIT)];
    }

    private static function curseforgeVersions(string $id, ?string $version, string $loader): array
    {
        $data = self::get("https://api.curseforge.com/v1/mods/$id/files", array_filter(['gameVersion' => $version, 'modLoaderType' => self::CURSEFORGE_LOADERS[$loader], 'pageSize' => 25]), ['x-api-key' => self::curseforgeKey()]);

        return collect($data['data'] ?? [])
            ->filter(fn ($f) => $f['downloadUrl'] && str_ends_with(strtolower($f['fileName']), '.jar'))
            ->map(fn ($f) => ['id' => (string) $f['id'], 'name' => $f['displayName'], 'file' => $f['fileName'], 'url' => $f['downloadUrl']])
            ->values()->all();
    }
}
