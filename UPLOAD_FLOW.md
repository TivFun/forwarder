# B站视频投稿流程说明

## 完整流程

### 1. TypeScript 入口 (upload-tiktok/index.ts)

**主函数：`uploadTikTokOnce()`**

流程：
1. `getLatestDownloadedVideo()` - 获取最新下载的视频文件
2. `getLastTikTokUrl()` - 读取保存的 TikTok URL
3. `getLastTikTokTitle()` - 读取保存的 TikTok 标题
4. `getLastTikTokTime()` - 读取保存的 TikTok 时间
5. 格式化标题：`原标题 - YYYY-MM-DD TikTok`
6. 准备元数据 `BilibiliUploadMeta`：
   - `title`: 格式化后的标题
   - `desc`: TikTok URL
   - `tags`: ["反田叶月"]
   - `tid`: 85 (情感分区)
   - `sourceUrl`: TikTok URL
   - `copyright`: 2 (转载)
7. 调用 Python 脚本 `upload_tiktok_to_bilibili.py`

### 2. Python 脚本 (upload_tiktok_to_bilibili.py)

**主函数：`main()` → `upload_video()`**

#### 关键函数：

1. **`extract_cover_from_video(video_path)`**
   - 使用 ffmpeg 从视频提取封面
   - 返回封面图片路径

2. **`upload_video(video_path, title, desc, source_url, tags, tid)`**
   - 创建 `Credential` 对象（使用 SESSDATA, CSRF, BUVID3）
   - 提取封面图片
   - 创建 `VideoMeta` 对象
   - 创建 `VideoUploaderPage` 对象
   - 创建 `VideoUploader` 对象
   - 注册事件监听器
   - 修补提交方法
   - 调用 `uploader.start()` 开始上传

#### bilibili-api-python 库的关键类：

1. **`video_uploader.VideoMeta`**
   - 参数：`tid`, `title`, `tags`, `desc`, `cover`, `no_reprint`
   - **问题**：不支持 `copyright` 参数（会抛出 TypeError）
   - **当前处理**：创建后通过 `setattr(meta, "copyright", 2)` 设置

2. **`video_uploader.VideoUploaderPage`**
   - 参数：`path`, `title`, `description`
   - 表示单个视频页面

3. **`video_uploader.VideoUploader`**
   - 参数：`pages`, `meta`, `credential`, `line`
   - 负责整个上传流程
   - 方法：`start()` - 开始上传
   - 事件：`PRE_SUBMIT` - 提交前的最后机会

### 3. 当前修改 preset 信息的尝试

#### 尝试 1: 在 VideoMeta 创建时设置
```python
meta = video_uploader.VideoMeta(
    copyright=2,  # ❌ 不支持，会抛出 TypeError
    ...
)
```

#### 尝试 2: 通过 setattr 设置
```python
setattr(meta, "copyright", 2)  # ⚠️ 设置了但提交时仍为 1
meta.copyright = 2  # ⚠️ 同上
```

#### 尝试 3: 在 PRE_SUBMIT 事件中修改
```python
@uploader.on("__ALL__")
async def on_event(data):
    if data.get("name") == "PRE_SUBMIT":
        submit_data = data.get("data")
        submit_data["copyright"] = 2  # ⚠️ 可能数据是只读的
```

#### 尝试 4: 修补 _submit_video 方法
```python
original_submit = uploader._submit_video
async def patched_submit_video(*args, **kwargs):
    # 修改 args/kwargs
    return await original_submit(*args, **kwargs)
uploader._submit_video = patched_submit_video
```

#### 尝试 5: 修补 _build_submit_data 方法
```python
original_build = uploader._build_submit_data
def patched_build_submit_data(*args, **kwargs):
    data = original_build(*args, **kwargs)
    data["copyright"] = 2  # 在构建时修改
    return data
uploader._build_submit_data = patched_build_submit_data
```

## 问题分析

从日志可以看到：
- 第 14 行：`Final meta state - copyright: 2, tid: 160` ✅ 设置成功
- 第 24 行：`PRE_SUBMIT` 事件中 `'copyright': 1, 'tid': 160` ❌ 提交时被重置

**问题根源**：`VideoUploader` 在构建提交数据时，可能从 `VideoMeta` 的某个内部方法（如 `as_dict()`）获取数据，而该方法返回的是原始数据，不包含我们设置的 `copyright`。

## 建议的解决方案

需要查看 `bilibili-api-python` 的源码，找到：
1. `VideoMeta.as_dict()` 方法 - 看它如何构建字典
2. `VideoUploader._build_submit_data()` 或类似方法 - 看它如何构建提交数据
3. `VideoUploader._submit_video()` 方法 - 看它如何提交数据

然后在这些方法中强制设置 `copyright` 和 `tid`。

