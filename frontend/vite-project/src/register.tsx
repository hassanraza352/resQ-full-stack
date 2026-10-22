
import {
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './css/Register.module.css'
import ambulance from './assets/ambulance.jpg'

type Role = 'user' | 'unit' | 'hospital'

const ROLES: {
  key: Role
  label: string
}[] = [
  {
    key: 'user',
    label: 'User',
  },
  {
    key: 'unit',
    label: 'Service unit',
  },
  {
    key: 'hospital',
    label: 'Hospital staff',
  },
]

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

function Register() {
  useEffect(() => {
    const frame1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document
          .querySelector(`.${styles.registerPage}`)
          ?.classList.add(styles.ready)
      })
    })

    return () => cancelAnimationFrame(frame1)
  }, [])

  const navigate = useNavigate()

  const [role, setRole] = useState<Role>('user')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // const selectedRole = ROLES.find((item) => item.key === role)

  const passwordStrength = password
    ? [
        password.length >= 8,
        /\d/.test(password),
        /[A-Z]/.test(password),
        /[^A-Za-z0-9]/.test(password),
      ].filter(Boolean).length
    : 0

  const strengthWords = [
    '',
    'Too weak',
    'Getting there',
    'Good',
    'Strong',
  ]

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (loading) return

    setError('')
    setSuccess('')

    const formData = new FormData(event.currentTarget)

    const name = String(formData.get('name') || '').trim()
    const email = String(formData.get('email') || '')
      .trim()
      .toLowerCase()
    const phone = String(formData.get('phone') || '').trim()
    const formPassword = String(formData.get('password') || '')

    if (formPassword.length < 8) {
      setError('Password must contain at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name,
          email,
          phone,
          password: formPassword,
          role,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data.message || data.error || 'Registration failed. Please try again.',
        )
      }

      setSuccess(
        data.message || 'Account created successfully. Redirecting to login...',
      )

      window.setTimeout(() => {
        navigate('/login', {
          state: { registeredEmail: email },
        })
      }, 1000)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect to the server. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  const backgroundStyle = {
    '--ambulance-image': `url("${ambulance}")`,
  } as CSSProperties

  return (
    <main
      className={`${styles.registerPage} ${styles.ready}`}
      style={backgroundStyle}
    >
      <div className={styles.bg} aria-hidden="true" />

      <div className={styles.wrap}>
        <section className={styles.hero}>
          <a className={styles.logo} href="/">
            <svg viewBox="0 0 30 30" aria-hidden="true">
              <circle cx="15" cy="15" r="15" fill="#830000" />
              <path
                d="M13 7h4v6h6v4h-6v6h-4v-6H7v-4h6z"
                fill="#fff"
              />
            </svg>
            RESQ
          </a>

          <h1 aria-label="Be part of a safer community.">
            <span className={styles.w}>
              <span style={{ '--i': 0 } as CSSProperties}>
                Be part of
              </span>
            </span>

            <span className={styles.w}>
              <span style={{ '--i': 1 } as CSSProperties}>
                a safer
              </span>
            </span>

            <span className={styles.w}>
              <span style={{ '--i': 2 } as CSSProperties}>
                community.
              </span>
            </span>
          </h1>

          <p className={styles.heroText}>
            Join RESQ and be ready when it matters.
          </p>
        </section>

        <section className={styles.card}>
          <h2>Create your account</h2>

          <p className={styles.sub}>
            Choose how you will use RESQ.
          </p>

          <div
            className={styles.roles}
            role="group"
            aria-label="Account type"
          >
            {ROLES.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={role === item.key}
                onClick={() => setRole(item.key)}
                disabled={loading}
              >
                {item.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            <div className={styles.fld}>
              <input
                id="register-name"
                name="name"
                type="text"
                placeholder=" "
                autoComplete="name"
                required
              />

              <label htmlFor="register-name">Full name</label>
            </div>

            <div className={styles.fld}>
              <input
                id="register-email"
                name="email"
                type="email"
                placeholder=" "
                autoComplete="email"
                required
              />

              <label htmlFor="register-email">Email</label>
            </div>

            <div className={styles.fld}>
              <input
                id="register-phone"
                name="phone"
                type="tel"
                placeholder=" "
                autoComplete="tel"
                required
              />

              <label htmlFor="register-phone">Phone number</label>
            </div>

            <div className={styles.fld}>
              <input
                id="register-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder=" "
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
              />

              <label htmlFor="register-password">Password</label>

              <button
                className={styles.eye}
                type="button"
                onClick={() =>
                  setShowPassword((value) => !value)
                }
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div
              className={`${styles.meter} ${
                passwordStrength
                  ? styles[`s${passwordStrength}`]
                  : ''
              }`}
              aria-hidden="true"
            >
              <i />
              <i />
              <i />
              <i />
            </div>

            <p className={styles.hint}>
              {passwordStrength
                ? strengthWords[passwordStrength]
                : 'Use 8+ characters with a number and a capital letter.'}
            </p>

            {error && (
              <p role="alert" style={{ color: '#c62828' }}>
                {error}
              </p>
            )}

            {success && (
              <p role="status" style={{ color: 'green' }}>
                {success}
              </p>
            )}

            <button
              className={styles.go}
              type="submit"
              disabled={loading}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className={styles.links}>
            Already have an account?{' '}
            <a href="/login">Login</a>
          </p>
        </section>
      </div>
    </main>
  )
}

export default Register
