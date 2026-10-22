
import {
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './css/Login.module.css'
import ambulance from './assets/ambulance.jpg'
import { useAuth } from "./context/AuthContext";
  
type Role = 'user' | 'unit' | 'hospital' | 'admin'

const ROLES: {
  key: Role
  label: string
  path: string
}[] = [
  { key: 'user', label: 'User', path: '/user/dashboard' },
  { key: 'unit', label: 'Unit', path: '/unit/dashboard' },
  { key: 'hospital', label: 'Hospital', path: '/hospital/overview' },
  { key: 'admin', label: 'Admin', path: '/admin/dashboard' },
]

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

function Login() {
  useEffect(() => {
    const frame1 = requestAnimationFrame(() => {
      const frame2 = requestAnimationFrame(() => {
        document
          .querySelector(`.${styles.loginPage}`)
          ?.classList.add(styles.ready)
      })

      return () => cancelAnimationFrame(frame2)
    })

    return () => cancelAnimationFrame(frame1)
  }, [])

  const navigate = useNavigate()

  const [role, setRole] = useState<Role>('user')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const activeIndex = ROLES.findIndex((item) => item.key === role)
  const selectedRole = ROLES[activeIndex]
  const { refreshAuth } = useAuth();

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (loading) return

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          role
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || 'Login failed. Please try again.')
      }

      if (!data.success || !data.user?.role) {
        throw new Error('Invalid login response from server.')
      }

      const actualRole = data.user.role as Role

      const selectedAccount = ROLES.find(
        (item) => item.key === actualRole,
      )

      if (!selectedAccount) {
        throw new Error('Invalid account role received from server.')
      }

      if (actualRole !== role) {
        throw new Error(
          `This account belongs to the ${selectedAccount.label} role. Please select the correct login option.`,
        )
      }
        await refreshAuth();
      navigate(selectedAccount.path)
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
      className={`${styles.loginPage} ${styles.ready}`}
      style={backgroundStyle}
    >
      <div className={styles.bg} aria-hidden="true" />

      <div className={styles.wrap}>
        <section className={styles.hero}>
          <a className={styles.logo} href="/">
            <svg viewBox="0 0 30 30" aria-hidden="true">
              <circle
                cx="15"
                cy="15"
                r="15"
                fill="#830000"
              />

              <path
                d="M13 7h4v6h6v4h-6v6h-4v-6H7v-4h6z"
                fill="#fff"
              />
            </svg>

            RESQ
          </a>

          <h1 aria-label="Together for a safer tomorrow.">
            <span className={styles.w}>
              <span style={{ '--i': 0 } as CSSProperties}>
                Together
              </span>
            </span>

            <span className={styles.w}>
              <span style={{ '--i': 1 } as CSSProperties}>
                for a safer
              </span>
            </span>

            <span className={styles.w}>
              <span style={{ '--i': 2 } as CSSProperties}>
                tomorrow.
              </span>
            </span>
          </h1>

          <p className={styles.heroText}>
            Emergency calls, ambulances and hospitals on one platform.
          </p>
        </section>

        <section className={styles.card}>
          <div
            className={styles.seg}
            role="tablist"
            aria-label="Log in as"
          >
            <i
              className={styles.pill}
              style={{
                transform: `translateX(${activeIndex * 100}%)`,
              }}
              aria-hidden="true"
            />

            {ROLES.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={role === item.key}
                onClick={() => {
                  setRole(item.key)
                  setError('')
                }}
                disabled={loading}
              >
                {item.label}
              </button>
            ))}
          </div>

          <h2>Welcome back</h2>

          <p className={styles.sub}>
            Log in to your account to continue.
          </p>

          <form onSubmit={handleSubmit}>
            <div className={styles.fld}>
              <input
                id="login-id"
                name="email"
                type="email"
                placeholder=" "
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />

              <label htmlFor="login-id">Email</label>
            </div>

            <div className={styles.fld}>
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder=" "
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />

              <label htmlFor="login-password">Password</label>

              <button
                className={styles.eye}
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            {error && (
              <p
                role="alert"
                style={{ color: '#c62828' }}
              >
                {error}
              </p>
            )}

            <button
              className={styles.go}
              type="submit"
              disabled={loading}
            >
              {loading
                ? 'Logging in…'
                : role === 'user'
                  ? 'Login'
                  : `Login as ${selectedRole.label}`}
            </button>
          </form>

          <div className={styles.links}>
            <a href="/forgot">Forgot password?</a>

            <span>
              No account?{' '}
              <a href="/register">Register</a>
            </span>
          </div>
        </section>
      </div>
    </main>
  )
}

export default Login
