# Douyin automation icon templates

Place PNG screenshots for icon matching in this directory. The backend screen executor looks for these filenames:

- `douyin-search-box.png`, `search-box.png`, or `search-icon.png`
- `video-card.png`, `video-play.png`, or `douyin-video.png`
- `comment-icon.png`, `douyin-comment.png`, or `comment-button.png`

Tips:

- Crop each PNG tightly around the visible UI target.
- Use screenshots taken on the same display scale as the machine running the backend.
- If matching is too strict, lower `douyin.acquisition.match-threshold` in `src/main/resources/application.properties`.
- If matching is slow, increase `douyin.acquisition.match-step`.
