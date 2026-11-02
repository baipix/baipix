---
title: Why I made Baipix
description: 'I wanted a pixel art editor that felt like Figma, and I couldn’t find one. So I started making it.'
date: '2026-11-02'
category: news
author: Todo-bai
cover: /screenshot-light.png
draft: false
---

I'm a designer, from France. I've been at it for about twenty years. I started out at a video game company, then worked in retail for a while, and now I'm in tech. And I've always loved pixel art.

## How it started

A while ago I needed some pixel art for work. We were making stickers around the line "Run anywhere. Chill everywhere." I wanted a little guy chilling on his cloud.

<figure class="pixel-figure">
  <img src="/blog/chill-everywhere.svg" width="360" height="320" alt="A pixel art guy in a cap and dark glasses, chilling on a white cloud, with a few sparkles around him." />
  <figcaption>The sticker: a little guy chilling on his cloud. <a href="/app/?open=/blog/chill-everywhere.baipix">Open it in Baipix</a> to see how it's made.</figcaption>
</figure>

I looked around for an editor that felt like Figma, with the same shortcuts and the same way of moving around, and I didn't find one.

A lot of pixel art editors dress up their own interface in pixel art. It's cute, but I find it gets in the way of the drawing. And the good ones cost money.

Around the same time I was trying out Claude, Anthropic's AI. I asked it a few things, and it ended up giving me a rough first version of an editor. That was at the end of September. I liked it, so I kept going.

## What I wanted from it

Mostly, I wanted it to feel familiar. Layers on the left, settings on the right, components, boards side by side. If you use Figma, you shouldn't have to look for much.

I also wanted the drawings to come out clean. Baipix exports SVG with one path per color, so you can paste a drawing into Figma and keep working on it. There's PNG too, Aseprite files, tilesets, and now GIFs.

It also plays nice with the rest: the SVG pastes into Illustrator too, Aseprite opens the files, tilesets go straight into Godot or Tiled, and you can bring in palettes from Lospec.

And I wanted anyone to be able to use it. It's free, it runs in the browser, there's no account to make, and the code is open source. My hope is that it becomes a go-to pixel art tool for anyone, whether you've been drawing for years or never tried.

## The people who come

People come to try it from all over. The US, Brazil, Europe, Japan. A lot of them on weekends, which I like. Some even started to help: translations into Italian and Japanese, tests, a GIF export. I didn't expect that, and it's really nice.

## What's next

I mostly add what I miss when I use it. For a while that was animation. It's [in there now](/pixel-art-animation/).

What I'd love now is for people who draw to get their hands on it. Use it, break it, tell me what's missing or what bugs them. I'd like it to become a good tool for pixel artists, shaped by the people who use it.

It's at [baipix.app](/app/) if you want to give it a go. And if something bothers you, [tell me on GitHub](https://github.com/baipix/baipix/discussions). I read everything.
