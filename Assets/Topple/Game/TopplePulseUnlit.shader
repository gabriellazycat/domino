// Topple: unlit pulsante p/ marcadores (trigger). Simples de propósito:
// pisca o alfa com o relógio. Se falhar, o jogo usa URP/Lit (fallback em código).
Shader "Topple/PulseUnlit"
{
    Properties
    {
        _Color ("Color", Color) = (0.15, 0.85, 0.45, 0.9)
        _Speed ("Speed", Float) = 4.0
        _Amp ("Amp", Float) = 0.3
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" }
        Pass
        {
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            struct appdata { float4 vertex : POSITION; };
            struct v2f { float4 pos : SV_POSITION; };
            fixed4 _Color;
            float _Speed;
            float _Amp;
            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                return o;
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float p = 0.5 + 0.5 * sin(_Time.y * _Speed);
                fixed4 c = _Color;
                c.a *= (1.0 - _Amp * 0.5 + _Amp * p);
                return c;
            }
            ENDCG
        }
    }
}
