# Supabase セットアップガイド

このガイドでは、クイズアプリをSupabaseに接続してクラウド同期を有効にする手順を説明します。

## 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com/) にアクセスしてアカウントを作成
2. 「New Project」をクリック
3. プロジェクト名を入力（例: `kenchiku-quiz`）
4. データベースパスワードを設定（安全なパスワードを使用）
5. リージョンを選択（日本に近い場所、例: Northeast Asia (Tokyo)）
6. 「Create new project」をクリック

## 2. データベーステーブルの作成

1. Supabaseダッシュボードで「SQL Editor」を開く
2. `supabase/schema.sql` ファイルの内容をコピー
3. SQLエディタに貼り付けて実行

## 3. 認証設定

### メール認証を有効化
1. 「Authentication」→「Providers」を開く
2. 「Email」がEnabledになっていることを確認

### 確認メールをスキップ（開発用）
1. 「Authentication」→「Settings」を開く
2. 「Confirm email」のトグルをOFFにする（開発環境のみ）

## 4. APIキーの取得

1. 「Project Settings」→「API」を開く
2. 以下の値をコピー:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6...`

## 5. 設定ファイルの更新

`supabase-config.js` を開いて、コピーした値を入力:

```javascript
const SUPABASE_CONFIG = {
    url: 'https://your-project-id.supabase.co',  // Project URLを入力
    anonKey: 'your-anon-key-here'                // anon public keyを入力
};
```

## 6. 管理者ユーザーの設定

管理者ダッシュボードにアクセスするには、ユーザーを管理者として設定する必要があります。

1. まず通常通りアプリでユーザー登録
2. Supabaseダッシュボードの「Table Editor」を開く
3. 「profiles」テーブルを選択
4. 管理者にしたいユーザーの `is_admin` を `true` に変更

## 7. デプロイ

### Vercel へのデプロイ
```bash
npx vercel --prod --yes
```

### 環境変数（オプション）
Vercelで環境変数を使用する場合:
1. Vercelダッシュボードでプロジェクトを開く
2. Settings → Environment Variables
3. 以下を追加:
   - `SUPABASE_URL`: プロジェクトURL
   - `SUPABASE_ANON_KEY`: anon public key

## 使い方

### ユーザー向け
1. アプリにアクセス
2. 「ログイン」または「新規登録」を選択
3. メールアドレスとパスワードを入力
4. ログイン後、自動的にクラウド同期が有効に

### オフラインモード
- Supabaseを設定しない場合、自動的にオフラインモード（LocalStorage）で動作
- ログイン画面で「オフラインで利用する」を選択可能

### 管理者向け
1. `/admin/` にアクセス
2. 管理者アカウントでログイン
3. 全ユーザーの学習状況を確認可能

## 機能一覧

### クラウド同期される項目
- 間違えた問題
- ブックマーク
- 学習履歴
- 統計データ
- 適応型学習データ
- 学習時間

### 管理者ダッシュボード
- ユーザー一覧
- 各ユーザーの正答率
- 学習回数
- アクティブ状況
- アプリ別進捗
- CSVエクスポート

## トラブルシューティング

### 「Supabaseが設定されていません」と表示される
- `supabase-config.js` の設定を確認
- URLとキーが正しく入力されているか確認

### ログインできない
- メールアドレスとパスワードを確認
- Supabaseの認証設定を確認

### データが同期されない
- ネットワーク接続を確認
- ブラウザのコンソールでエラーを確認

### 管理者ページにアクセスできない
- `profiles` テーブルで `is_admin` が `true` になっているか確認
