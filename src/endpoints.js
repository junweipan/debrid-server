const endpointGroups = [
  {
    base: "api",
    allowEnvToken: true,
    endpoints: [
      { path: "/account/infos", summary: "Get user infos" },
      { path: "/account/update", summary: "Update user infos" },
      { path: "/seedbox/list", summary: "List torrents" },
      { path: "/seedbox/activity", summary: "Get torrents activity" },
      { path: "/seedbox/add", summary: "Add a torrent" },
      {
        path: "/seedbox/:idTorrents/remove",
        summary: "Remove one or more torrents",
      },
      {
        path: "/seedbox/:idTorrent/zip",
        summary: "Create a zip archive for torrent files",
      },
      {
        path: "/seedbox/:idTorrent/config",
        summary: "Configure a waiting torrent",
      },
      { path: "/seedbox/limits", summary: "Get seedbox limits and usage" },
      { path: "/seedbox/rss/list", summary: "List RSS feeds and items" },
      { path: "/seedbox/rss/add", summary: "Add an RSS feed" },
      { path: "/seedbox/rss/:id/test", summary: "Test an RSS feed" },
      {
        path: "/seedbox/rss/:id/update",
        summary: "Update an RSS feed configuration",
      },
      { path: "/seedbox/rss/:ids/remove", summary: "Remove RSS feeds" },
      { path: "/seedbox/rss/limits", summary: "Get RSS limits and usage" },
      {
        path: "/seedbox/rss/limits/compare",
        summary: "Compare RSS limits by account type",
      },
      { path: "/downloader/list", summary: "List downloader links" },
      { path: "/downloader/add", summary: "Add downloader links" },
      {
        path: "/downloader/:idLinks/remove",
        summary: "Remove downloader links",
      },
      { path: "/downloader/hosts", summary: "List supported hosts" },
      { path: "/downloader/domains", summary: "List supported domains" },
      {
        path: "/downloader/regex",
        summary: "List regex rules and hostnames (deprecated)",
      },
      {
        path: "/downloader/limits",
        summary: "Get downloader limits and usage",
      },
      { path: "/files/:idParent/list", summary: "List files under a folder" },
      { path: "/stream/transcode/add", summary: "Create a transcode task" },
      {
        path: "/stream/transcode/:id/infos",
        summary: "Get transcode information",
      },
    ],
  },
  {
    base: "oauth",
    allowEnvToken: false,
    endpoints: [
      {
        path: "/oauth/token",
        upstreamPath: "/oauth/token",
        summary: "Create, refresh or exchange OAuth tokens",
      },
      {
        path: "/oauth/device/code",
        upstreamPath: "/oauth/device/code",
        summary: "Create a device code for limited input devices",
      },
      {
        path: "/oauth/revoke",
        upstreamPath: "/oauth/revoke",
        summary: "Revoke access or refresh tokens",
      },
    ],
  },
];

module.exports = endpointGroups;
