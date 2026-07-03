#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

import cv2
from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "ui_designer" / "public_pages" / "unsoccer-yandex-games-assets"
OUT = ROOT / "ui_designer" / "public_pages" / "unsoccer-vkplay-assets"


def crop_fill(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    src_w, src_h = image.size
    dst_w, dst_h = size
    src_ratio = src_w / src_h
    dst_ratio = dst_w / dst_h
    if src_ratio > dst_ratio:
        crop_w = int(src_h * dst_ratio)
        left = (src_w - crop_w) // 2
        box = (left, 0, left + crop_w, src_h)
    else:
        crop_h = int(src_w / dst_ratio)
        top = (src_h - crop_h) // 2
        box = (0, top, src_w, top + crop_h)
    return image.crop(box).resize(size, Image.Resampling.LANCZOS)


def save_png(source_name: str, target_name: str, size: tuple[int, int]) -> dict:
    image = Image.open(SOURCE / source_name).convert("RGB")
    result = crop_fill(image, size)
    target = OUT / target_name
    result.save(target, optimize=True)
    return {"file": str(target.relative_to(ROOT)), "size": target.stat().st_size, "width": size[0], "height": size[1]}


def save_icon(source_name: str, target_name: str, size: tuple[int, int]) -> dict:
    image = Image.open(SOURCE / source_name).convert("RGBA")
    result = image.resize(size, Image.Resampling.LANCZOS)
    target = OUT / target_name
    result.save(target, optimize=True)
    return {"file": str(target.relative_to(ROOT)), "size": target.stat().st_size, "width": size[0], "height": size[1]}


def save_loading_image() -> dict:
    poster = Image.open(SOURCE / "poster-1280x720.png").convert("RGB")
    base = crop_fill(poster, (1000, 1000)).filter(ImageFilter.GaussianBlur(10))
    sharp = crop_fill(poster, (900, 506))
    x = (1000 - sharp.width) // 2
    y = 170
    base.paste(sharp, (x, y))
    base = ImageOps.autocontrast(base)
    target = OUT / "vkplay-game-loading-image-1000x1000.png"
    base.save(target, optimize=True)
    return {"file": str(target.relative_to(ROOT)), "size": target.stat().st_size, "width": 1000, "height": 1000}


def save_video_preview() -> dict:
    source = str(SOURCE / "gameplay-horizontal-1280x720.mp4")
    target = OUT / "vkplay-video-preview-342x190.webm"
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open {source}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    max_frames = min(frame_count, int(fps * 10)) if frame_count else int(fps * 10)
    out_fps = 12
    step = max(1, round(fps / out_fps))

    fourcc = cv2.VideoWriter_fourcc(*"VP80")
    writer = cv2.VideoWriter(str(target), fourcc, out_fps, (342, 190))
    if not writer.isOpened():
        raise RuntimeError("OpenCV cannot create VP8 WEBM video writer")

    written = 0
    read_index = 0
    while read_index < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        if read_index % step == 0:
            h, w = frame.shape[:2]
            src_ratio = w / h
            dst_ratio = 342 / 190
            if src_ratio > dst_ratio:
                crop_w = int(h * dst_ratio)
                left = (w - crop_w) // 2
                frame = frame[:, left : left + crop_w]
            else:
                crop_h = int(w / dst_ratio)
                top = (h - crop_h) // 2
                frame = frame[top : top + crop_h, :]
            frame = cv2.resize(frame, (342, 190), interpolation=cv2.INTER_AREA)
            writer.write(frame)
            written += 1
        read_index += 1

    cap.release()
    writer.release()
    if written == 0 or not target.exists():
        raise RuntimeError("no WEBM frames were written")
    return {
        "file": str(target.relative_to(ROOT)),
        "size": target.stat().st_size,
        "width": 342,
        "height": 190,
        "frames": written,
        "fps": out_fps,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    report = [
        save_png("cover-800x470.png", "vkplay-album-cover-626x352.png", (626, 352)),
        save_png("poster-1280x720.png", "vkplay-portrait-cover-398x530.png", (398, 530)),
        save_png("showcase-cover-1560x520.png", "vkplay-background-art-1544x380.png", (1544, 380)),
        save_icon("icon-512x512.png", "vkplay-desktop-icon-256x256.png", (256, 256)),
        save_loading_image(),
    ]
    try:
        report.append(save_video_preview())
    except Exception as exc:
        report.append({"file": "vkplay-video-preview-342x190.webm", "error": str(exc)})
    (OUT / "manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
