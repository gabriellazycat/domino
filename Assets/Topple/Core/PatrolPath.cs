// Posição num loop fechado de patrulha em t (puro, sem UnityEngine).
// Mesma matemática do SimEnemy.PatrolAdvance (que opera em Vector3 e mexe em
// Rigidbody): aqui só calcula (x,z) p/ a vitrine do planejamento. Manter as
// duas sincronizadas — teste EditMode trava o comportamento (fecha o loop,
// velocidade constante, determinístico).
using System.Collections.Generic;

namespace Topple.Core
{
    public static class PatrolPath
    {
        public static (float x, float z) PosAt(IList<(float x, float z)> loop, float speed, float t)
        {
            if (loop == null || loop.Count < 2) return (0f, 0f);
            float total = 0f;
            for (int i = 0; i < loop.Count; i++)
            {
                var a = loop[i];
                var b = loop[(i + 1) % loop.Count];
                float dx = b.x - a.x, dz = b.z - a.z;
                total += (float)System.Math.Sqrt(dx * dx + dz * dz);
            }
            if (total < 1e-4f) return loop[0];
            float target = (t * speed) % total;
            for (int i = 0; i < loop.Count; i++)
            {
                var a = loop[i];
                var b = loop[(i + 1) % loop.Count];
                float dx = b.x - a.x, dz = b.z - a.z;
                float seg = (float)System.Math.Sqrt(dx * dx + dz * dz);
                if (target <= seg)
                {
                    float k = seg < 1e-6f ? 0f : target / seg;
                    return (a.x + dx * k, a.z + dz * k);
                }
                target -= seg;
            }
            return loop[loop.Count - 1];
        }
    }
}
