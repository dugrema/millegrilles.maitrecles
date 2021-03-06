import React, {useState, useEffect, useCallback} from 'react'
import {Row, Col, Button, Alert, Form} from 'react-bootstrap'
import { Trans } from 'react-i18next'
import {pki as forgePki} from 'node-forge'

import {ModalAjouterWebauthn} from './WebauthnAjouter'
import { detecterAppareilsDisponibles } from '@dugrema/millegrilles.common/lib/detecterAppareils'

const QrCodeScanner = React.lazy( _=> import('./QrCodeScanner') )

export default function GestionCompte(props) {

  const [section, setSection] = useState('')
  const [videoinput, setVideoinput] = useState('')

  useEffect(_=>{
    detecterAppareilsDisponibles()
      .then(apps=>{
        console.debug("Appareils detectes : %O", apps)
        setVideoinput(apps.videoinput === true)
      })
  }, [])

  let Section
  let resetMethodes = false,
      scanQr = false

  switch(section) {

    case 'reset':
      resetMethodes = true
      Section = AjouterMethode
      break
    case 'ajouterMethode':
      Section = AjouterMethode
      break
    case 'scanQr':
      scanQr = true
      Section = ActiverCsr
      break
    case 'activerCsr':
      Section = ActiverCsr
      break

    default: Section = null

  }

  if(Section) {
    return (
      <Section retour={_=>{setSection('')}}
               resetMethodes={resetMethodes}
               scanQr={scanQr}
               nomUsager={props.rootProps.nomUsager}
               {...props} />
    )
  }

  return (
    <>
      <h3>Verification du compte</h3>
      <Row>
        <Col lg={8}>Ajouter une nouvelle methode (cle USB, appareil mobile, etc)</Col>
        <Col>
          <Button variant="secondary" onClick={_=>{setSection('ajouterMethode')}}>Ajouter methode</Button>
        </Col>
      </Row>
      <Row>
        <Col lg={8}>
          Reset toutes les methodes. Permet de reprendre le controle si une cle
          ou un appareil est perdu ou vole. Une nouvelle methode sera configuree
          durant le reset.
        </Col>
        <Col>
          <Button variant="secondary" onClick={_=>{setSection('reset')}}>Reset</Button>
        </Col>
      </Row>
      <Row>
        <Col lg={8}>
          Activer un code QR (scan).
        </Col>
        <Col>
          <Button variant="secondary" disabled={!videoinput} onClick={_=>{setSection('scanQr')}}>Scan</Button>
        </Col>
      </Row>
      <Row>
        <Col lg={8}>
          Coller une requete de certificat PEM (CSR) pour activer un
          nouvel appareil.
        </Col>
        <Col>
          <Button variant="secondary" onClick={_=>{setSection('activerCsr')}}>Activer</Button>
        </Col>
      </Row>
    </>
  )
}

function AjouterMethode(props) {

  const [confirmation, setConfirmation] = useState(false)
  const [show, setShow] = useState(false)

  const setComplete = _ => {
    console.debug("Registration completee avec succes")
    setTimeout(_=>{props.retour()}, 2500)
    setShow(false)
    setConfirmation(true)
  }

  const demarrer = _ => {
    setShow(true)
  }

  return (
    <>
      <ModalAjouterWebauthn show={show}
                            setComplete={setComplete}
                            hide={_=>{setShow(false)}}
                            {...props} />

      <h3>Ajouter methode de verification</h3>

      <p>Une nouvelle methode de verification va etre ajoutee a votre compte.</p>

      {props.resetMethodes?
        <p>ATTENTION : Les methodes existantes vont etre supprimees.</p>
        :''
      }

      <Alert variant="success" show={confirmation?true:false}>
        <Alert.Heading>Succes</Alert.Heading>
        {props.resetMethodes?
          <p>Les methodes existantes on ete supprimees.</p>
          :''
        }
        <p>Nouvelle methode ajoutee avec succes.</p>
      </Alert>

      <Button onClick={demarrer}><Trans>bouton.suivant</Trans></Button>
      <Button variant="secondary" onClick={props.retour}><Trans>bouton.retour</Trans></Button>
    </>
  )
}

function ActiverCsr(props) {

  const [csr, setCsr] = useState('')
  const [err, setErr] = useState('')
  const [resultat, setResultat] = useState('')
  const [succes, setSucces] = useState(false)

  const nomUsager = props.nomUsager

  useEffect(_=>{
    // Valider le CSR
    if(!csr) {
      setResultat('')
      setErr('')
      return
    }
    lireCsr(csr)
      .then(resultat=>{
        if(resultat.err) {
          setErr(''+resultat.err)
          return
        } else if(nomUsager !== resultat.nomUsager) {
          setErr(`Nom usager ${resultat.nomUsager} du code QR ne correspond pas au compte de l'usager`)
          return
        }

        // Ok, certificat match
        setResultat(resultat)
        setErr('')
      })
  }, [csr, nomUsager])

  const changerCsr = useCallback(event => {
    const csr = event.currentTarget?event.currentTarget.value:event
    setCsr(csr)
    setErr('')
  }, [])

  const handleScan = data => {
    // Convertir data en base64, puis ajouter header/footer CSR
    try {
      const dataB64 = btoa(data)
      const pem = `-----BEGIN CERTIFICATE REQUEST-----\n${dataB64}\n-----END CERTIFICATE REQUEST-----`
      setCsr(pem)
      setErr('')
    } catch(err) {
      setErr(''+err)
    }
  }

  const activer = async _ => {
    console.debug("Activer CSR de l'usager %s", resultat.nomUsager)
    const reponse = await activerCsr(props.workers.connexion, resultat.nomUsager, csr)
    console.debug("Reponse activation: %O", reponse)
    setErr('')
    setResultat('')
    setSucces(true)
  }

  let zoneActivation
  if(props.scanQr) {
    zoneActivation = (
      <QrCodeScanner actif={(resultat || succes)?false:true}
                     handleScan={handleScan}
                     handleError={err=>{setErr(''+err)}} />
    )
  } else {
    zoneActivation = (
      <Form.Group controlId="csr">
        <Form.Label>Coller le PEM ici</Form.Label>
        <Form.Control as="textarea" rows={16} onChange={changerCsr}/>
      </Form.Group>
    )
  }

  return (
    <>
      <h3>Activer fichier CSR</h3>

      {zoneActivation}

      <Alert variant="danger" show={err?true:false}>
        <Alert.Heading>Erreur</Alert.Heading>
        <p>{err}</p>
      </Alert>

      <Alert variant="success" show={resultat?true:false}>
        <Alert.Heading>Code valide</Alert.Heading>
        <p>Le code est valide pour l'usager {props.nomUsager}. Cliquez sur
        le bouton Activer pour poursuivre.</p>
      </Alert>

      <Alert variant="success" show={succes}>
        <Alert.Heading>Activation reussie</Alert.Heading>
        <p>L'activation est reussie. L'appareil est maintenant actif.</p>
      </Alert>

      <Button onClick={activer} disabled={!resultat}>Activer</Button>
      <Button variant="secondary" onClick={props.retour}>Retour</Button>
    </>
  )
}

async function lireCsr(pem) {
  // Valider le contenu
  try {
    const csrForge = forgePki.certificationRequestFromPem(pem)
    const nomUsager = csrForge.subject.getField('CN').value
    return {pem, nomUsager, csrForge}
  } catch(err) {
    console.error("Erreur PEM : %O", err)
    return {err}
  }
}

async function activerCsr(connexion, nomUsager, csr) {

  const requeteGenerationCertificat = {
    nomUsager,
    csr,
    activationTierce: true,  // Flag qui indique qu'on active manuellement un certificat
  }
  console.debug("Requete generation certificat navigateur: \n%O", requeteGenerationCertificat)

  const reponse = await connexion.genererCertificatNavigateur(requeteGenerationCertificat)

  console.debug("Reponse cert recue %O", reponse)
  if(reponse && !reponse.err) {
    return true
  } else {
    throw new Error("Erreur reception confirmation d'activation")
  }

}
