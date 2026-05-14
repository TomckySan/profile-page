# Tomcky Profile Page

静的な1ページの自己紹介サイトです。HTMLとCSSだけで構成しているため、ビルド工程なしでそのまま公開できます。

## ローカルで確認する方法

このフォルダの `index.html` をブラウザで開いてください。

簡易サーバーで確認したい場合は、以下のように実行できます。

```sh
python3 -m http.server 8000
```

その後、ブラウザで `http://localhost:8000` を開きます。

## Cloudflare Pagesで公開する手順

1. このフォルダをGitHubなどのGitリポジトリに push します。
2. Cloudflare Dashboardで **Workers & Pages** を開きます。
3. **Create application** から **Pages** を選択します。
4. Gitリポジトリを接続します。
5. ビルド設定は以下にします。
   - Build command: 空欄
   - Build output directory: `/`
6. デプロイすると公開URLが発行されます。

## プロフィール画像を差し替える方法

`index.html` は `profile.jpg` をプロフィール画像として参照しています。

画像を差し替える場合は、新しい画像を `profile.jpg` という名前でこのフォルダに置いてください。別のファイル名にしたい場合は、`index.html` の以下の部分を変更します。

```html
<img src="profile.jpg" alt="Tomckyのプロフィール画像">
```
