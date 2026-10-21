# 部署到公网

本项目是纯静态前端，不需要后端或数据库。每个访问者的画板数据保存在自己的浏览器 `localStorage` 中，用户之间互不可见。

## 一、先构建

```bash
npm ci
npm run build
```

产物在 `dist/`。不要把 `npm run dev` 的开发服务器直接暴露到公网。

## 二、推荐：中国大陆用户使用国内静态托管

如果主要用户在**中国大陆**，长期稳定访问最可靠的是：

> 域名 + ICP 备案 + 国内对象存储/静态网站 + CDN + HTTPS

可选服务：

- 阿里云 OSS 静态网站托管 + 阿里云 CDN
- 腾讯云 COS 静态网站托管 + 腾讯云 CDN
- 七牛云等国内对象存储

步骤：

1. 购买域名并完成实名认证。
2. 在云厂商处购买对象存储，创建 Bucket。
3. 通过云厂商提交 **ICP 备案**；大陆 CDN/自定义域名通常都要求备案。
4. 开启静态网站托管：
   - 默认首页：`index.html`
   - 默认 404：`index.html`（本应用没有前端路由，通常不会用到）
5. 将 `dist/` 内的**全部文件**上传到 Bucket 根目录（不是把 `dist` 文件夹本身传上去）。
6. 绑定自定义域名，配置 CDN 和免费/购买的 HTTPS 证书。
7. 缓存建议：
   - `assets/*`：长缓存（文件名带哈希，例如一年）
   - `index.html`：不缓存或很短缓存
8. 用手机 4G/5G 访问域名测试。

备案、公安备案和安全合规要求以你的云厂商和当地政策为准。备案通常需要几天到几周。

### 不备案的替代方案

- 使用香港/海外 VPS 或对象存储：无需大陆 ICP，但大陆访问速度和稳定性不保证。
- Cloudflare / Vercel / Netlify 等海外平台：部署方便，但大陆访问可能慢或间歇不可用，适合演示和海外用户，不适合把大陆访问稳定性作为硬指标。

## 三、快速预览：GitHub Pages

项目已带好工作流：`.github/workflows/deploy-pages.yml`。

1. 把代码推到 GitHub 仓库。
2. 打开仓库 **Settings → Pages**，把 Build and deployment 的 Source 设为 **GitHub Actions**。
3. 推送 `main` 或 `master` 分支后，Action 会自动构建并部署。
4. 地址通常是：

   `https://<用户名>.github.io/<仓库名>/`

例如：

`https://Yuyuxuan677.github.io/Math_plot_tool/`

注意：

- 仓库需要是公开的；私有仓库使用 Pages 通常需要付费计划。
- 中国移动/电信/联通访问 `github.io` 的体验可能不稳定，因此**GitHub Pages 只建议做临时预览**，正式面向大陆用户请优先使用国内静态托管。
- 本项目 `vite.config.ts` 已经设置 `base: './'`，部署在仓库子路径下也能加载资源。

如果 GitHub 推送或访问不稳定，可以在本地配置代理后再推送；Actions 是在 GitHub 服务器上构建，不受你本机网络影响。

## 四、临时演示：隧道

适合临时把本机服务发给别人看，**不适合长期公开访问**。

```bash
npm run build
npm run preview
# 另开一个终端
cloudflared tunnel --url http://localhost:4173
```

或：

```bash
ngrok http 4173
```

限制：电脑必须一直开机；地址可能变化；不要用这种方式承载正式用户。

## 五、云服务器 + Nginx（可选）

如果后续要加后端、账号或管理功能，可以升级到云服务器。

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/jiantu;
    index index.html;

    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
```

再用 Certbot 或云厂商证书配置 HTTPS：

```bash
sudo certbot --nginx -d example.com
```

大陆服务器 + 域名同样需要 ICP 备案。

## 六、部署后验收

1. 手机用蜂窝网络（不连 Wi-Fi）打开公网地址。
2. 检查 HTTPS 证书正常。
3. 依次测试：添加函数、参数滑条、多条切线、手绘图形、等分点开关、轨迹方程、3D 旋转缩放、刷新后数据恢复。
4. 在另一台设备打开，确认每台设备的数据互不影响（这是预期行为）。
5. 检查浏览器控制台无报错。

## 七、重要说明

当前是“每个用户本地使用”的形态：

- 网站可以公开访问
- 但每个用户的画板只存在自己的浏览器里
- 换设备、换浏览器不会同步
- 清除浏览器站点数据会丢失画板

如果以后需要“登录、云同步、老师发布画板、学生提交”，需要增加后端、数据库、账号体系和隐私政策，这不是当前静态部署能解决的。
