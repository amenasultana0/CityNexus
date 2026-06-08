import { Box, Container, Input, Text } from "@chakra-ui/react"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
} from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FiLock, FiMail } from "react-icons/fi"

import type { Body_login_login_access_token as AccessToken } from "@/client"
import { Field } from "@/components/ui/field"
import { InputGroup } from "@/components/ui/input-group"
import { PasswordInput } from "@/components/ui/password-input"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { emailPattern, passwordRules } from "../utils"

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({ to: "/dashboard" })
    }
  },
})

function Login() {
  const { loginMutation, error, resetError } = useAuth()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccessToken>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: { username: "", password: "" },
  })

  const onSubmit: SubmitHandler<AccessToken> = async (data) => {
    if (isSubmitting) return
    resetError()
    try {
      await loginMutation.mutateAsync(data)
    } catch {}
  }

  return (
    <Box minH="100vh" position="relative" overflow="hidden"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 30%, #0c4a6e 65%, #134e4a 100%)",
        backgroundSize: "300% 300%",
        animation: "gradientShift 10s ease infinite",
      }}
    >
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes orbFloat {
          0%,100% { transform: translateY(0) scale(1); }
          50%     { transform: translateY(-20px) scale(1.06); }
        }
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseRing {
          0%   { box-shadow: 0 0 0 0   rgba(16,185,129,0.7); }
          70%  { box-shadow: 0 0 0 10px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0   rgba(16,185,129,0); }
        }
        @keyframes logoPulse {
          0%,100% { text-shadow: 0 0 20px rgba(0,212,170,0.4); }
          50%     { text-shadow: 0 0 40px rgba(0,212,170,0.8), 0 0 80px rgba(0,212,170,0.3); }
        }
        .login-input input, .login-input {
          background: rgba(255,255,255,0.07) !important;
          border-color: rgba(255,255,255,0.15) !important;
          color: white !important;
          border-radius: 12px !important;
        }
        .login-input input::placeholder { color: rgba(255,255,255,0.35) !important; }
        .login-input input:focus {
          border-color: rgba(0,212,170,0.6) !important;
          box-shadow: 0 0 0 3px rgba(0,212,170,0.15) !important;
        }
        .login-btn {
          position: relative; overflow: hidden;
          transition: all 0.28s cubic-bezier(0.34,1.56,0.64,1);
        }
        .login-btn::before {
          content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
          background: linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent);
          transition: left 0.5s ease;
        }
        .login-btn:hover::before { left: 100%; }
        .login-btn:hover { transform: translateY(-2px) scale(1.02); }
        .main-link { color: #6ee7b7 !important; font-weight: 600; text-decoration: none; }
        .main-link:hover { text-decoration: underline; }
      `}</style>

      {/* Floating orbs */}
      <Box position="absolute" top="-20%" left="5%" w="500px" h="500px" borderRadius="full" pointerEvents="none"
        style={{ background: "radial-gradient(circle,rgba(99,102,241,0.2) 0%,transparent 70%)", animation: "orbFloat 7s ease-in-out infinite" }} />
      <Box position="absolute" bottom="-20%" right="5%" w="400px" h="400px" borderRadius="full" pointerEvents="none"
        style={{ background: "radial-gradient(circle,rgba(6,148,162,0.2) 0%,transparent 70%)", animation: "orbFloat 9s ease-in-out infinite 2s" }} />
      <Box position="absolute" top="40%" right="15%" w="250px" h="250px" borderRadius="full" pointerEvents="none"
        style={{ background: "radial-gradient(circle,rgba(245,158,11,0.12) 0%,transparent 70%)", animation: "orbFloat 6s ease-in-out infinite 1s" }} />

      {/* Grid texture */}
      <Box position="absolute" inset="0" pointerEvents="none" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)",
        backgroundSize: "50px 50px",
      }} />

      {/* Login card */}
      <Container
        as="form"
        onSubmit={handleSubmit(onSubmit)}
        h="100vh"
        maxW="420px"
        display="flex"
        flexDirection="column"
        alignItems="stretch"
        justifyContent="center"
        gap={4}
        position="relative"
        zIndex={1}
      >
        <Box
          style={{
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "28px",
            padding: "40px 36px",
            boxShadow: "0 24px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset",
            animation: "slideUpFade 0.55s cubic-bezier(0.22,1,0.36,1) both",
          }}
        >
          {/* Logo */}
          <Box textAlign="center" mb={8}>
            <Box display="inline-flex" alignItems="center" justifyContent="center" gap={2} mb={2}>
              <Box
                w="10px" h="10px" borderRadius="full" bg="#00d4aa"
                style={{ animation: "pulseRing 2.5s ease-in-out infinite" }}
              />
              <Text
                fontSize="2.2rem"
                fontWeight="900"
                letterSpacing="-0.02em"
                style={{
                  background: "linear-gradient(135deg,#ffffff 0%,#6ee7b7 40%,#00d4aa 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  animation: "logoPulse 3s ease-in-out infinite",
                }}
              >
                CityNexus
              </Text>
            </Box>
            <Text fontSize="0.65rem" color="rgba(255,255,255,0.4)" letterSpacing="3px" textTransform="uppercase" fontWeight="700">
              Ride Intelligence · Hyderabad
            </Text>
          </Box>

          {/* Heading */}
          <Box mb={6}>
            <Text fontSize="1.4rem" fontWeight="800" color="white" mb={1}>Welcome back</Text>
            <Text fontSize="sm" color="rgba(255,255,255,0.45)">Sign in to your account to continue</Text>
          </Box>

          {/* Email field */}
          <Box mb={4}>
            <Text fontSize="0.62rem" color="rgba(255,255,255,0.45)" fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>
              Email
            </Text>
            <Field
              invalid={!!errors.username}
              errorText={errors.username?.message || (error ? "Invalid credentials" : undefined)}
            >
              <InputGroup w="100%" startElement={<FiMail color="rgba(255,255,255,0.4)" />} className="login-input">
                <Input
                  {...register("username", {
                    required: "Username is required",
                    pattern: emailPattern,
                  })}
                  placeholder="you@example.com"
                  type="email"
                  className="login-input"
                />
              </InputGroup>
            </Field>
          </Box>

          {/* Password field */}
          <Box mb={2}>
            <Text fontSize="0.62rem" color="rgba(255,255,255,0.45)" fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>
              Password
            </Text>
            <PasswordInput
              type="password"
              startElement={<FiLock color="rgba(255,255,255,0.4)" />}
              {...register("password", passwordRules())}
              placeholder="••••••••"
              errors={errors}
              className="login-input"
            />
          </Box>

          {/* Forgot password */}
          <Box textAlign="right" mb={6}>
            <RouterLink to="/recover-password" className="main-link" style={{ fontSize: "13px" }}>
              Forgot password?
            </RouterLink>
          </Box>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="login-btn"
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "14px",
              border: "none",
              fontWeight: "800",
              fontSize: "15px",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              background: isSubmitting
                ? "rgba(255,255,255,0.2)"
                : "linear-gradient(135deg, #00d4aa 0%, #0694a2 50%, #1a56db 100%)",
              color: "#fff",
              letterSpacing: "0.02em",
              boxShadow: isSubmitting ? "none" : "0 8px 32px rgba(0,212,170,0.4)",
            }}
          >
            {isSubmitting ? "Signing in…" : "Sign In →"}
          </button>

          {/* Divider */}
          <Box my={5} position="relative">
            <Box h="1px" bg="rgba(255,255,255,0.1)" />
            <Text
              position="absolute" top="-9px" left="50%" transform="translateX(-50%)"
              px={3} fontSize="xs" color="rgba(255,255,255,0.35)"
              style={{ background: "transparent" }}
            >
              or
            </Text>
          </Box>

          {/* Sign up */}
          <Text textAlign="center" fontSize="sm" color="rgba(255,255,255,0.45)">
            Don't have an account?{" "}
            <RouterLink to="/signup" className="main-link">
              Sign Up
            </RouterLink>
          </Text>
        </Box>

        {/* Bottom tagline */}
        <Text textAlign="center" fontSize="xs" color="rgba(255,255,255,0.25)" fontWeight="600" letterSpacing="1px">
          BUILT FOR HYDERABAD COMMUTERS
        </Text>
      </Container>
    </Box>
  )
}