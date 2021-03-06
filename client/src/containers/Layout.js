import React from 'react'
import { Container, Row, Col} from 'react-bootstrap'
import { Trans } from 'react-i18next'
import QRCode from 'qrcode.react'

import Menu from './Menu'

import { getManifest } from '../mappingDependances'

import './Layout.css'

export default function LayoutMillegrilles(props) {

  return (
    <div className="flex-wrapper">

      <div>

        <Entete
          changerPage={props.changerPage}
          goHome={props.goHome}
          sousMenuApplication={props.sousMenuApplication}
          rootProps={props.rootProps} />

        {props.children}

      </div>

      <Footer rootProps={props.rootProps} footerFige={false}/>

    </div>
  )

}

function Entete(props) {
  return (
    <Container>

      <Menu
        changerPage={props.changerPage}
        goHome={props.goHome}
        sousMenuApplication={props.sousMenuApplication}
        rootProps={props.rootProps} />

    </Container>
  )
}

function Footer(props) {

  const idmg = props.rootProps.idmg
  var qrCode = null

  if(idmg) {
    qrCode = <QRCode value={'idmg:' + idmg} size={75} />
  }

  var className = 'footer bg-info'
  if(props.footerFige) {
    className += ' footer-fige'
  }

  const manifest = getManifest()

  return (
    <Container fluid className={className}>
      <Row>
        <Col sm={2} className="footer-left"></Col>
        <Col sm={8} className="footer-center">
          <div className="millegrille-footer">
            <div>IDMG : {idmg}</div>
            <div>
              <Trans>application.advert</Trans>{' '}
              <span title={manifest.date}>
                <Trans values={{version: manifest.version}}>application.version</Trans>
              </span>
            </div>
          </div>
        </Col>
        <Col sm={2} className="footer-right">{qrCode}</Col>
      </Row>
    </Container>
  )
}
