// PatrolPath puro: fecha o loop, velocidade constante, determinístico.
// Offset da vitrine (SimEnemy.PatrolOffset): mesma fórmula + deslocamento.
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using Topple.Core;
using Topple.Sim;

namespace Topple.Tests
{
    public class PatrolPathTests
    {
        static List<(float x, float z)> Square(float h) => new()
        {
            (-h, -h), (h, -h), (h, h), (-h, h),
        };

        [Test] public void Loop_StartsAtZeroAndCloses()
        {
            var loop = Square(1f);
            var p0 = PatrolPath.PosAt(loop, 0.5f, 0f);
            Assert.AreEqual(-1f, p0.x, 1e-6f);
            Assert.AreEqual(-1f, p0.z, 1e-6f);
            // Período = perímetro/velocidade = 8/0,5 = 16 s → volta ao início.
            var p1 = PatrolPath.PosAt(loop, 0.5f, 16f);
            Assert.AreEqual(p0.x, p1.x, 1e-4f);
            Assert.AreEqual(p0.z, p1.z, 1e-4f);
        }

        [Test] public void Loop_ConstantSpeedReachesOppositeCorner()
        {
            var loop = Square(1f);
            // Meio período (8 s) = meio perímetro (4 m) → canto oposto (1,1).
            var p = PatrolPath.PosAt(loop, 0.5f, 8f);
            Assert.AreEqual(1f, p.x, 1e-4f);
            Assert.AreEqual(1f, p.z, 1e-4f);
        }

        [Test] public void Loop_Deterministic()
        {
            var loop = Square(1f);
            var a = PatrolPath.PosAt(loop, 0.3f, 7.77f);
            var b = PatrolPath.PosAt(loop, 0.3f, 7.77f);
            Assert.AreEqual(a, b);
        }

        [Test] public void Loop_DegenerateReturnsZero()
        {
            Assert.AreEqual((0f, 0f), PatrolPath.PosAt(null, 0.5f, 1f));
            Assert.AreEqual((0f, 0f), PatrolPath.PosAt(new List<(float, float)> { (1f, 2f) }, 0.5f, 1f));
        }

        [Test] public void Patrol_OffsetContinuesVitrine()
        {
            // Mesma matemática da vitrine + offset (a sim nasce onde ESTAVA).
            var go = new GameObject("PatrolOffsetProbe");
            try
            {
                var en = go.AddComponent<SimEnemy>();
                en.Patrol = new List<Vector3> { new(0f, 0f, 0f), new(4f, 0f, 0f) };
                en.PatrolSpeed = 1f;
                en.PatrolOffset = 0f;
                en.PatrolAdvance(1f);
                Assert.AreEqual(1f, go.transform.position.x, 1e-4f, "t=1 sem offset");
                en.PatrolOffset = 2f;
                en.PatrolAdvance(1f);
                Assert.AreEqual(3f, go.transform.position.x, 1e-4f, "t=1+offset 2");
            }
            finally { Object.DestroyImmediate(go); }
        }
    }
}
