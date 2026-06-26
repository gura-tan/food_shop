# 🏪 食品出店 注文管理システム

Chromebook複数台を使ったリアルタイム注文管理Webアプリです。  
Vite + React + TypeScript + Supabase Realtime で構築されています。

## セットアップ

### 1. Supabase プロジェクトの設定

1. [Supabase](https://supabase.com) でプロジェクトを開く
2. SQL Editor を開き、`supabase/migrations/001_initial.sql` の内容を貼り付けて実行する
3. **Realtime** の有効化:  
   Database → Replication → Realtime で `orders`, `order_items`, `settings`, `tickets` の Realtime を有効にする

### 2. 環境変数の設定

```bash
cp .env.example .env.local
```

`.env.local` を開き、Supabase の URL と anon key を入力:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...
```

> Settings → API から確認できます。

### 3. ローカル開発

```bash
npm install
npm run dev
```

### 4. Vercel デプロイ

1. このプロジェクトを GitHub リポジトリに push する
2. [Vercel](https://vercel.com) で「New Project」→ GitHub リポジトリを選択
3. Environment Variables に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定
4. Deploy する

---

## 使い方

| タブ | 担当 | 主な操作 |
|------|------|----------|
| 設定 | 管理者 | メニュー登録・番号札枚数設定・リセット・ログ閲覧 |
| レジ | レジ担当者 | 注文入力・会計処理 |
| 厨房 | 調理担当者 | 注文確認・商品完成ボタン |
| 受取 | 受取担当者 | 商品受け渡し確認・受取完了ボタン |

### ステータス遷移

```
注文中 → 会計中 → 調理中 → 受け渡し中 → 受取済み
           ↑
        (戻るボタン)
```

### 番号札

- デフォルトは 15 枚（設定タブから変更可）
- 最後の番号の次は 1 番に戻る（循環）
- 受取完了で自動的に「未使用」に戻る

---

## 技術スタック

- **Vite + React + TypeScript** — フロントエンド
- **Supabase** — PostgreSQL + Realtime (CDC)
- **Vercel** — ホスティング
- **date-fns** — 日付フォーマット

## ファイル構成

```
src/
├── components/
│   ├── DeviceSetup.tsx       # 初回デバイス名登録
│   ├── OfflineOverlay.tsx    # オフライン時表示
│   ├── TabNav.tsx            # タブナビゲーション
│   └── tabs/
│       ├── SettingsTab.tsx   # 設定タブ
│       ├── CashierTab.tsx    # レジタブ
│       ├── KitchenTab.tsx    # 厨房タブ
│       └── PickupTab.tsx     # 受取タブ
├── hooks/
│   ├── useOrders.ts
│   ├── useMenus.ts
│   ├── useSettings.ts
│   └── useOnlineStatus.ts
├── lib/
│   ├── supabase.ts
│   └── logger.ts
└── types/index.ts
supabase/migrations/001_initial.sql
```
