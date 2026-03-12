declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare global {
  interface Window {
    electronAPI: {
      // Window controls
      minimize: () => Promise<void>;
      close: () => Promise<void>;
      startDrag: () => Promise<void>;

      // Dialog
      selectSavePath: () => Promise<string>;

      // Database
      getAccount: () => Promise<any>;
      saveAccount: (account: {
        nickname: string;
        fakeid: string;
        cookie: string;
        token: string;
        appmsg_token?: string;
        weixin_2021_1?: number;
      }) => Promise<any>;
      deleteAccount: () => Promise<any>;

      getArticlesFromDb: () => Promise<any[]>;
      saveArticle: (article: {
        account_id: number;
        fakeid: string;
        title: string;
        link: string;
        content?: string;
        author?: string;
        source_url?: string;
        cover_image?: string;
        publish_date?: string;
        read_count?: number;
        like_count?: number;
      }) => Promise<any>;
      clearArticles: () => Promise<any>;

      getSetting: (key: string) => Promise<string>;
      setSetting: (key: string, value: string) => Promise<any>;

      // WeChat API
      getQrcode: () => Promise<any>;
      checkScan: (uuid: string) => Promise<any>;
      confirmLogin: (cookie: string) => Promise<any>;
      searchBiz: (keyword: string, cookie: string, token: string) => Promise<any>;
      getArticles: (fakeid: string, cookie: string, token: string, appmsgToken: string) => Promise<any>;
      getArticleDetail: (link: string, cookie: string) => Promise<any>;

      // Export
      saveFile: (filePath: string, data: string) => Promise<{ success: boolean; error?: string }>;

      // Notification
      showNotification: (title: string, body: string) => Promise<void>;

      // Events
      onCollectProgress: (callback: (progress: { current: number; total: number; currentTitle: string }) => void) => void;
    };
  }
}

export {};