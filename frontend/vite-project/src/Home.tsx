
import { useEffect, type CSSProperties } from 'react'
import './css/Home.css'

function Home() {
  useEffect(() => {
    const REVEAL_AT = 4.3

    const hero = document.getElementById('hero') as HTMLElement | null
    const v = document.getElementById('v') as HTMLVideoElement | null
    const hat = document.getElementById('hat') as SVGElement | null
    const replay = document.getElementById('replay') as HTMLButtonElement | null

    if (!hero || !v || !hat || !replay) {
      return
    }

    const root = document.documentElement

    const cvs = [
      ...document.querySelectorAll('.thumb canvas'),
    ] as HTMLCanvasElement[]

    const HAT = {
      x: 0.665,
      y: 0.45,
      w: 0.10,
      rot: -8,
      flip: false,
    }

    const M = [
      [0.532, 1.545, -0.848, -0.118],
      [-0.011, 0.966, 0.571, -0.234],
      [-1.047, 3.422, -1.115, -0.157],
    ]

    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    let done = false
    let timer: ReturnType<typeof setTimeout> | null = null

    if (reduce) {
      hero.classList.add('rm')
    }

    function sample() {
      try {
        const c = document.createElement('canvas')

        c.width = 1
        c.height = 1

        const x = c.getContext('2d', {
          willReadFrequently: true,
        })

        if (!x) return
        if(!v) return

        x.drawImage(
          v,
          v.videoWidth * 0.94,
          v.videoHeight * 0.12,
          1,
          1,
          0,
          0,
          1,
          1
        )

        const p = x.getImageData(0, 0, 1, 1).data

        const [r, g, b] = M.map((m) =>
          Math.max(
            0,
            Math.min(
              255,
              Math.round(
                m[0] * p[0] +
                  m[1] * p[1] +
                  m[2] * p[2] +
                  m[3] * 255
              )
            )
          )
        )

        root.style.setProperty(
          '--bg',
          `rgb(${r},${g},${b})`
        )

        root.style.setProperty(
          '--ghost',
          `rgb(${Math.round(r * 0.955)},${Math.round(
            g * 0.955
          )},${Math.round(b * 0.955)})`
        )
      } catch {
        // CSS fallback
      }
    }
 

    function placeHat() {
      if(!v)return
      const W = v.clientWidth
      const H = v.clientHeight
      const vw = v.videoWidth
      const vh = v.videoHeight

      if (!vw || !W || !vh || !H) {
        return
      }

      const k = Math.max(W / vw, H / vh)

      const op = getComputedStyle(v)
        .objectPosition
        .split(' ')
        .map((t) => parseFloat(t) / 100)

      const ox =
        (W - vw * k) *
        (Number.isNaN(op[0]) ? 0.5 : op[0])

      const oy =
        (H - vh * k) *
        (Number.isNaN(op[1]) ? 0.5 : op[1])
        if(!hat)return

      hat.style.left =
        v.offsetLeft +
        ox +
        HAT.x * vw * k +
        'px'

      hat.style.top =
        v.offsetTop +
        oy +
        HAT.y * vh * k +
        'px'

      hat.style.width =
        HAT.w * vw * k +
        'px'

      hat.style.setProperty(
        '--rot',
        HAT.rot + 'deg'
      )

      hat.style.scale = HAT.flip
        ? '-1 1'
        : '1'
    }

    function thumbs() {
      cvs.forEach((c) => {
        try {
          const [fx, fy, fs] =
            c.dataset.crop
              ?.split(',')
              .map(Number) ?? []

          if (
            fx === undefined ||
            fy === undefined ||
            fs === undefined
          ) {
            return
          }
                  if(!v)return

          const w = v.videoWidth
          const h = v.videoHeight

          if (!w || !h) {
            return
          }

          const s = fs * w

          const ctx = c.getContext('2d')

          if (!ctx) {
            return
          }

          ctx.drawImage(
            v,
            fx * w,
            fy * h,
            s,
            s,
            0,
            0,
            c.width,
            c.height
          )

          c.classList.add('shown')
        } catch {
          // Ignore canvas errors
        }
      })
    }

    function reveal() {
      if (done) {
        return
      }

      done = true

      if (timer) {
        clearTimeout(timer)
        timer = null
      }

      placeHat()
        if(!hero)return

      hero.classList.add('is-revealed')

      setTimeout(
        thumbs,
        reduce ? 0 : 500
      )
    }

    function start() {
      sample()
        if(!v)return

      if (reduce) {
        const go = () => {
          v.pause()
          reveal()
        }

        v.addEventListener(
          'seeked',
          go,
          { once: true }
        )

        v.currentTime = Math.max(
          0,
          (v.duration || REVEAL_AT + 1) - 0.05
        )

        return
      }

      v.play().catch(() => {
        reveal()
      })
    }

    function handleTimeUpdate() {
              if(!v)return

      if (v.currentTime >= REVEAL_AT) {
        reveal()
      }
    }

    function handleReplay() {
      done = false
            if(!hero)return

      hero.classList.remove(
        'is-revealed'
      )

      cvs.forEach((c) => {
        c.classList.remove('shown')
      })
        if(!v)return

      v.currentTime = 0

      v.play().catch(() => {
        reveal()
      })

      if (timer) {
        clearTimeout(timer)
      }

      timer = setTimeout(
        reveal,
        9000
      )
    }

    v.addEventListener(
      'timeupdate',
      handleTimeUpdate
    )

    v.addEventListener(
      'ended',
      reveal
    )

    v.addEventListener(
      'error',
      reveal
    )

    timer = setTimeout(
      reveal,
      9000
    )

    if (v.readyState >= 2) {
      start()
    } else {
      v.addEventListener(
        'loadeddata',
        start,
        { once: true }
      )
    }

    replay.addEventListener(
      'click',
      handleReplay
    )

    const io =
      new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('in')

              io.unobserve(
                entry.target
              )
            }
          })
        },
        {
          threshold: 0.18,
        }
      )

    document
      .querySelectorAll('.io')
      .forEach((el) => {
        io.observe(el)
      })

    window.addEventListener(
      'resize',
      placeHat
    )

    v.addEventListener(
      'loadedmetadata',
      placeHat
    )

    return () => {
      if (timer) {
        clearTimeout(timer)
      }

      window.removeEventListener(
        'resize',
        placeHat
      )

      v.removeEventListener(
        'loadedmetadata',
        placeHat
      )

      v.removeEventListener(
        'timeupdate',
        handleTimeUpdate
      )

      v.removeEventListener(
        'ended',
        reveal
      )

      v.removeEventListener(
        'error',
        reveal
      )

      replay.removeEventListener(
        'click',
        handleReplay
      )

      io.disconnect()
    }
  }, [])

  const delay = (value: number): CSSProperties =>
    ({
      '--d': value,
    } as CSSProperties)

  return (
 <div className="home-page">
      <header className="hero" id="hero">
        <video
          id="v"
          src="https://thinkingods.com/demos/kingfisher-hero/hero.mp4"
          muted
          playsInline
          preload="auto"
        />

        <div
          className="ghost"
          aria-hidden="true"
        >
          res<em>Q</em>
        </div>

        <svg
          width="0"
          height="0"
          style={{ position: 'absolute' }}
          aria-hidden="true"
        >
          <filter
            id="amb"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix
              type="matrix"
              values="0.532 1.545 -0.848 0 -0.118 -0.011 0.966 0.571 0 -0.234 -1.047 3.422 -1.115 0 -0.157 0 0 0 1 0"
            />
          </filter>
        </svg>

        <svg
          className="hat"
          id="hat"
          viewBox="0 0 100 64"
          aria-hidden="true"
        >
          <path
            d="M12 40C10 10 90 10 88 40Z"
            fill="#fff"
            stroke="#0E1B2E"
            strokeWidth="1.5"
          />

          <rect
            x="11"
            y="36"
            width="78"
            height="11"
            rx="3"
            fill="#1F5FBF"
            stroke="#0E1B2E"
            strokeWidth="1.5"
          />

          <path
            d="M64 47Q92 45 99 57Q80 58 62 53Z"
            fill="#0E1B2E"
          />

          <circle
            cx="50"
            cy="25"
            r="9"
            fill="#D8322F"
            stroke="#fff"
            strokeWidth="1.5"
          />

          <path
            d="M48 19h4v4h4v4h-4v4h-4v-4h-4v-4h4z"
            fill="#fff"
          />
        </svg>

        <div className="ov"></div>

        <nav>
          <a
            className="brand rv"
            style={delay(0)}
            href="#"
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 26 26"
              aria-hidden="true"
            >
              <path
                d="M3 15c5-9 12-11 20-9-3 3-5 4-8 5 2 1 3 3 3 6-5 0-9-1-12-4l-3 3z"
                fill="#0E1B2E"
              />

              <path
                d="M15 11c3-1 5-2 8-5-3 0-6 1-8 5z"
                fill="#1F5FBF"
              />
            </svg>

            resQ
          </a>

          <div
            className="navr rv"
            style={delay(0)}
          >
            <a
              className="pill dark"
              href="/login"
            >
              login in
            </a>
          </div>
        </nav>

        <div className="copy">
          <div
            className="eyebrow mono rv"
            style={delay(1)}
          >
            Rapid response platform
          </div>

          <h1
            className="rv"
            style={delay(2)}
          >
            Help that lands with{' '}
            <em>precision</em>
          </h1>

          <p
            className="lede rv"
            style={delay(3)}
          >
            resQ routes every emergency call
            to the nearest ready responder in
            seconds, with live location, medical
            context and one shared timeline for
            every team on scene.
          </p>

          <div
            className="ctas rv"
            style={delay(4)}
          >
            <a
              className="pill cta"
              href="#"
            >
              Request a demo <i>&rarr;</i>
            </a>

            <a
              className="ul"
              href="#"
            >
              Watch it work &#8599;
            </a>
          </div>
        </div>

        <div className="cluster">
          <div
            className="trust mono rv"
            style={delay(5)}
          >
            <div className="av">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>

            Trusted by 40 response teams
          </div>

          <div className="cards">
            <div
              className="card rv"
              style={delay(6)}
            >
              <div className="ch mono">
                <span>Alerts</span>
                <span>01</span>
              </div>

              <div
                className="thumb"
                data-cap="Live alert"
              >
                <canvas
                  width="320"
                  height="320"
                  data-crop="0.555,0.335,0.22"
                />
              </div>

              <div className="stat">
                &lt; 90s
              </div>

              <div className="dots">
                <i></i>
                <i></i>
                <i></i>
              </div>
            </div>

            <div
              className="card rv"
              style={delay(7)}
            >
              <div className="ch mono">
                <span>Dispatch</span>
                <span>02</span>
              </div>

              <div
                className="thumb"
                data-cap="Nearest unit"
              >
                <canvas
                  width="320"
                  height="320"
                  data-crop="0.43,0.60,0.24"
                />
              </div>

              <div className="stat">
                24/7
              </div>

              <div className="dots">
                <i></i>
                <i></i>
                <i></i>
              </div>
            </div>
          </div>
        </div>

        <div
          className="strip rv"
          style={delay(8)}
        >
          <div className="sp">
            <span className="mono">
              Unit 01
            </span>

            <em>Always on watch</em>
          </div>

          <span
            className="mono mid"
            style={{
              color: 'var(--ink-2)',
            }}
          >
            Live &middot; 24/7 dispatch
          </span>

          <button
            className="replay mono"
            id="replay"
            type="button"
          >
            &#8635; Replay
          </button>
        </div>
      </header>

      <section
        className="notes"
        id="notes"
      >
        <div className="nh">
          <div className="io">
            <div className="kick mono">
              <b>02</b> Field notes &mdash; why
              resQ
            </div>

            <h2>
              It reads the scene, then sends help
              in one clean motion
            </h2>
          </div>

          <p
            className="io"
            style={delay(2)}
          >
            Most delays happen before anyone is
            sent: unclear locations, missing
            context, calls passed between desks.
            resQ removes those steps so the
            closest unit moves first.
          </p>
        </div>

        <div className="bento">
          <article className="n d io">
            <div className="idx mono">
              Note 01 &middot; Routing
            </div>

            <h3>
              The nearest unit, not the nearest
              guess
            </h3>

            <p>
              Live positions and availability
              decide who goes. The dispatch path
              is shortest by minutes, not by map
              distance.
            </p>

            <svg
              className="arc"
              viewBox="0 0 360 170"
              aria-hidden="true"
            >
              <path d="M20 30C120 20 170 40 215 95S300 150 335 148" />

              <circle
                cx="20"
                cy="30"
                r="4"
                fill="#F2675F"
              />

              <circle
                cx="335"
                cy="148"
                r="4"
                fill="#EEF1F5"
              />

              <text
                x="20"
                y="54"
              >
                CALL
              </text>

              <text
                x="296"
                y="132"
              >
                ON SCENE
              </text>
            </svg>
          </article>

          <article
            className="n io"
            style={delay(1)}
          >
            <div className="idx mono">
              Note 02 &middot; Context
            </div>

            <h3>
              Context arrives first
            </h3>

            <p>
              Responders see the situation before
              they see the door.
            </p>

            <div className="chips">
              <span>Location</span>
              <span>Medical</span>
              <span>Hazard</span>
            </div>
          </article>

          <article
            className="n io"
            style={delay(2)}
          >
            <div className="idx mono">
              Note 03 &middot; Handoff
            </div>

            <h3>
              One timeline for every team
            </h3>

            <p>
              Fire, medical and police read from
              the same record, so nothing is
              repeated.
            </p>
          </article>

          <article
            className="n w io"
            style={delay(3)}
          >
            <div>
              <div className="idx mono">
                Note 04 &middot; Calm
              </div>

              <h3>
                Steady when the call volume isn't
              </h3>

              <p>
                Queues stay ordered by urgency
                during surges, so the next call is
                always the right one.
              </p>
            </div>

            <svg
              viewBox="0 0 150 150"
              aria-hidden="true"
            >
              <circle
                cx="75"
                cy="75"
                r="68"
                fill="none"
                stroke="rgba(14,27,46,.25)"
                strokeDasharray="3 5"
              />

              <circle
                cx="75"
                cy="75"
                r="42"
                fill="none"
                stroke="#1F5FBF"
                strokeWidth="1.5"
              />

              <circle
                cx="75"
                cy="75"
                r="14"
                fill="#D8322F"
              />

              <path
                d="M75 0v26M75 124v26M0 75h26M124 75h26"
                stroke="#0E1B2E"
                strokeWidth="1.2"
              />
            </svg>
          </article>
        </div>

        <div className="band io">
          <div className="b">
            <span className="lab mono">
              Response
            </span>

            <div className="big">
              &lt; 90
              <small> s</small>
            </div>

            <div className="ruler"></div>
          </div>

          <div className="b">
            <span className="lab mono">
              Units tracked
            </span>

            <div className="big">
              1,200+
            </div>

            <div className="circ">
              <i></i>
              <i></i>
            </div>
          </div>

          <div className="b">
            <span className="lab mono">
              Downtime
            </span>

            <div className="big">
              Zero
            </div>

            <div className="shim"></div>
          </div>

          <div className="b">
            <span className="lab mono">
              Handoff
            </span>

            <div className="big o">
              <em>One screen</em>
            </div>

            <svg
              className="curve"
              viewBox="0 0 160 30"
              width="160"
              height="30"
              aria-hidden="true"
            >
              <path d="M2 26C40 26 60 4 100 6S140 20 158 8" />
            </svg>
          </div>
        </div>

        <div className="close io">
          <h2>
            When minutes matter, the right unit
            should already be moving.
          </h2>

          <a
            className="pill cta"
            href="#"
            style={{
              display: 'inline-flex',
            }}
          >
            Request a demo <i>&rarr;</i>
          </a>
        </div>
      </section>
   </div>
  )
}

export default Home

