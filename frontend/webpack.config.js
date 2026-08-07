const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const { InjectManifest } = require("workbox-webpack-plugin");

module.exports = (env) => {
  const isProd = env && env.production;

  return {
    mode: isProd ? "production" : "development",
    entry: "./src/index.tsx",
    devtool: isProd ? "source-map" : "eval-source-map",

    output: {
      path: path.resolve(__dirname, "dist"),
      filename: isProd ? "js/[name].[contenthash:8].js" : "js/[name].js",
      chunkFilename: isProd
        ? "js/[name].[contenthash:8].chunk.js"
        : "js/[name].chunk.js",
      publicPath: "/",
      clean: true,
    },

    resolve: {
      extensions: [".ts", ".tsx", ".js"],
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: "ts-loader",
            options: {
              transpileOnly: true,
            },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : "style-loader",
            "css-loader",
          ],
        },
      ],
    },

    optimization: {
      // Lightweight UI: split vendor/app code so the shell loads fast and
      // rarely-changing vendor code is cached long-term via contenthash.
      splitChunks: { chunks: "all" },
      runtimeChunk: "single",
      minimize: isProd,
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: "./public/index.html",
      }),
      ...(isProd
        ? [
            new MiniCssExtractPlugin({
              filename: "css/[name].[contenthash:8].css",
            }),
            // Generates the service worker at build time from src/sw/service-worker.ts,
            // precaching the hashed build output for offline/PWA support.
            new InjectManifest({
              swSrc: path.resolve(__dirname, "src/sw/service-worker.ts"),
              swDest: "service-worker.js",
            }),
          ]
        : []),
    ],

    devServer: {
      static: { directory: path.resolve(__dirname, "public") },
      port: 3000,
      historyApiFallback: true,
      webSocketServer: {
        type: "ws",
        options: {
          path: "/wds-ws",
        },
      },
      client: {
        webSocketURL: {
          pathname: "/wds-ws",
        },
      },
      proxy: [
        {
          context: ["/api"],
          target: "http://localhost:4000",
          changeOrigin: true,
        },
      ],
    },

    performance: {
      hints: isProd ? "warning" : false,
      maxAssetSize: 250000,
      maxEntrypointSize: 250000,
    },
  };
};
